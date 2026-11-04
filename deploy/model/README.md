# Zcan's own model

The privacy agents run on an open-weights model that Zcan deploys itself, instead of an outside AI
company. It's served with [vLLM](https://docs.vllm.ai) on [Modal](https://modal.com) GPUs:

- **Private.** Modal's proxy rejects any request without Zcan's proxy token before it reaches the
  GPU, so nobody else can use the model or wake it up. vLLM's request logging stays off (its default),
  its access log is disabled, and `check.mjs` proves prompts don't appear in the logs.
- **Scales to zero.** After 5 minutes without requests the GPU shuts down and billing stops. The next
  agent request starts it again: Zcan pings the model when someone opens an agent, and while it boots
  (usually a minute or two) the agent shows "Zcan's model is starting up" and retries automatically.
- **Capped.** `max_containers=1`: never more than one GPU at a time.

Default model: [`openai/gpt-oss-20b`](https://huggingface.co/openai/gpt-oss-20b) (Apache 2.0) on one L4, the
cheapest setup that fits it. When Modal has no L4 free, it uses an L40S instead (about twice the price, only while it runs). For better reports,
`ZCAN_MODEL=openai/gpt-oss-120b ZCAN_GPU=H100` (about five times the cost). Compare on real agent runs (step 7).

## Cost

You pay only while a GPU is running: the start-up, the agent runs, and 5 idle minutes after the last
request. On the default L4 that's roughly $0.15–0.25 per burst of use; Modal's free Starter plan
includes $30 of compute a month. Check [modal.com/pricing](https://modal.com/pricing) for current GPU prices. The worst case is
one GPU running all day (busy all day, or someone keeping it awake on purpose), so **set a monthly
spending limit in Modal's billing settings** before you deploy.

## Set up

1. **Account.** Create a Modal account, add a payment method and set the spending limit.
2. **CLI.** On your computer:

   ```bash
   pip install modal
   modal setup
   ```

3. **Download the weights** (once: about 13 GB for the 20B model, 65 GB for the 120B):

   ```bash
   modal run deploy/model/modal_app.py::download
   ```

4. **Deploy.** It prints the model's URL, like `https://<workspace>--zcan-model-model.us-east.modal.direct`:

   ```bash
   modal deploy deploy/model/modal_app.py
   ```

   For the larger model: `ZCAN_MODEL=openai/gpt-oss-120b ZCAN_GPU=H100` in front of both commands.

5. **Proxy token.** In Modal: Settings → Proxy Auth Tokens
   ([modal.com/settings/proxy-auth-tokens](https://modal.com/settings/proxy-auth-tokens)) → create one.
   Zcan's API key is the token id and secret joined with a dot: `wk-….ws-…`. Keep it secret.

6. **Check it** (the first run waits for the GPU to start):

   ```bash
   AI_BASE_URL=https://<your-url>.modal.direct/v1 AI_API_KEY=wk-….ws-… node deploy/model/check.mjs
   ```

   All four checks should pass. Then run the `modal app logs … | grep …` line it prints: it must print
   nothing, which shows the prompts weren't logged.

7. **Compare (optional, recommended).** With a few shared agent runs exported
   (`scripts/finetune/prepare.mjs`), put the current model and yours side by side:

   ```bash
   BASE_URL=https://api.deepseek.com BASE_KEY=… BASE_MODEL=deepseek-v4-pro \
   CAND_URL=https://<your-url>.modal.direct/v1 CAND_KEY=wk-….ws-… CAND_MODEL=zcan-privacy-model \
   BLIND=1 node scripts/finetune/eval.mjs --limit 20
   ```

8. **Switch Zcan over.** In Vercel → Project → Settings → Environment Variables:

   | Variable | Value |
   |---|---|
   | `AI_BASE_URL` | `https://<your-url>.modal.direct/v1` |
   | `AI_API_KEY` | `wk-….ws-…` (the proxy token) |
   | `AI_MODEL` | `zcan-privacy-model` |
   | `AI_REASONING_EFFORT` | `medium` (`low` is faster, `high` more thorough) |
   | `NEXT_PUBLIC_AI_SELF_HOSTED` | `true` |
   | `NEXT_PUBLIC_AI_MODEL_NAME` | `Zcan Privacy Model` |
   | `NEXT_PUBLIC_AI_HOST` | `Modal` |
   | `NEXT_PUBLIC_AI_HOST_POLICY` | Modal's privacy policy URL |

   Remove any `DEEPSEEK_*` variables and any `AI_PLAN_MODEL` that points at DeepSeek, then redeploy.
   The site then says "Agents powered by Zcan Privacy Model", and the Transparency page lists Modal as
   the GPU host instead of DeepSeek.

## What the site says, and why

`src/lib/ai-model.ts` keeps the claims honest automatically:

- While an outside company answers the agents, the name shown everywhere is that company's
  (`NEXT_PUBLIC_AI_PROVIDER`, DeepSeek by default). A brand name can't replace it.
- With `NEXT_PUBLIC_AI_SELF_HOSTED=true`, the brand is shown and the GPU host is listed on the
  Transparency page as infrastructure: it runs Zcan's model, no AI company receives what people type.
- Web searches the agents write still go to Tavily, and Transparency says so. To keep those in-house
  too, a self-hosted search engine (e.g. SearXNG) would replace Tavily in `src/lib/web-search.ts`.

## Updating

Edit `modal_app.py` (e.g. a newer model or vLLM version) and run `modal deploy` again, then
`check.mjs`. Fine-tuned versions (see `scripts/finetune/README.md`) are served the same way: point
`ZCAN_MODEL` at the fine-tuned weights.
