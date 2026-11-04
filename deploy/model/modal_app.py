"""
Zcan's own model: an open-weights LLM served with vLLM's OpenAI-compatible API on Modal GPUs.

- Private: Modal's proxy rejects any request without Zcan's proxy token (Authorization: Bearer wk-….ws-…)
  before it reaches the container, so nobody else can use it or wake it up.
- Scales to zero: no requests for SCALEDOWN minutes → the GPU shuts down and billing stops. The next
  request starts it again (Modal answers 503 until it's ready; Zcan retries and shows "starting up").
- No prompt logging: vLLM's request logging stays off (its default), the access log is disabled and
  the log level is WARNING.

Deploy:   modal run deploy/model/modal_app.py::download   (once: puts the weights on a Modal Volume)
          modal deploy deploy/model/modal_app.py
Options (environment variables when deploying):
  ZCAN_MODEL   Hugging Face model id        default openai/gpt-oss-20b  (higher quality: openai/gpt-oss-120b)
  ZCAN_GPU     Modal GPU type(s), in order of preference, comma-separated
               default "L4,L40S": the cheapest that fits 20B, then a backup when Modal has no L4 free
               — 120B needs "H100"
  ZCAN_MAX_LEN context length in tokens     default 32768
See deploy/model/README.md.
"""

import os
import subprocess

import modal

MODEL = os.environ.get("ZCAN_MODEL", "openai/gpt-oss-20b")
# Modal takes the first type in the list that has capacity, so a shortage doesn't leave agents waiting.
GPUS = [g.strip() for g in os.environ.get("ZCAN_GPU", "L4,L40S").split(",") if g.strip()]
MAX_LEN = os.environ.get("ZCAN_MAX_LEN", "32768")
SERVED_NAME = "zcan-privacy-model"
PORT = 8000
MINUTES = 60
SCALEDOWN = 5  # minutes of no requests before the GPU shuts down (shorter = cheaper, more cold starts)

image = (
    modal.Image.from_registry("nvidia/cuda:12.9.0-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .uv_pip_install("vllm==0.21.0", "huggingface_hub[hf_transfer]")
    .env(
        {
            "HF_XET_HIGH_PERFORMANCE": "1",
            # Never log prompts: request logging is off by default; keep vLLM's own logs to warnings.
            "VLLM_LOGGING_LEVEL": "WARNING",
        }
    )
)

hf_cache = modal.Volume.from_name("zcan-hf-cache", create_if_missing=True)
vllm_cache = modal.Volume.from_name("zcan-vllm-cache", create_if_missing=True)
VOLUMES = {"/root/.cache/huggingface": hf_cache, "/root/.cache/vllm": vllm_cache}

app = modal.App("zcan-model")


@app.function(image=image, volumes=VOLUMES, timeout=60 * MINUTES)
def download():
    """Downloads the weights to the Volume once, so cold starts load from Modal storage, not the internet."""
    from huggingface_hub import snapshot_download

    snapshot_download(MODEL, ignore_patterns=["*.pt", "*.bin", "original/*", "metal/*"])
    hf_cache.commit()
    print(f"Downloaded {MODEL}")


def vllm_args() -> list[str]:
    args = [
        "vllm", "serve", MODEL,
        "--served-model-name", SERVED_NAME,
        "--host", "0.0.0.0",
        "--port", str(PORT),
        "--max-model-len", MAX_LEN,
        "--tensor-parallel-size", "1",
        # Tool calling (the agents' web search), per vLLM's gpt-oss recipe.
        "--enable-auto-tool-choice",
        "--tool-call-parser", "openai",
        # Logs: no access log (it would record requests), warnings only.
        "--disable-uvicorn-access-log",
        "--uvicorn-log-level", "warning",
    ]
    if MODEL.startswith("openai/gpt-oss-120b") and GPUS[0].startswith("H100"):
        # vLLM's recipe: on one H100 the defaults run out of memory.
        args += ["--gpu-memory-utilization", "0.95", "--max-num-batched-tokens", "1024"]
    return args


@app.server(
    image=image,
    gpu=GPUS if len(GPUS) > 1 else GPUS[0],
    volumes=VOLUMES,
    port=PORT,
    startup_timeout=20 * MINUTES,
    scaledown_window=SCALEDOWN * MINUTES,
    target_concurrency=16,
    max_containers=1,  # a hard cap on spend: never more than one GPU at a time
)
class Model:
    @modal.enter()
    def start(self):
        self.process = subprocess.Popen(vllm_args())

    @modal.exit()
    def stop(self):
        self.process.terminate()
