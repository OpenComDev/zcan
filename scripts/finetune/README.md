# Fine-tuning Zcan's own agent model

Tools for moving the privacy agents from a third-party model to a model trained on Zcan's own
(opt-in, anonymized) runs. Plain Node 18+ scripts, no dependencies. Everything they write goes to
`scripts/finetune/out/`, which is gitignored. Never commit training data.

| Script | What it does |
|---|---|
| `prepare.mjs` | Downloads the admin export, validates and cleans it, and writes `out/train.jsonl`, `out/eval.jsonl`, `out/eval.meta.jsonl` and `out/summary.json` |
| `eval.mjs` | Runs the held-out examples against a baseline and a candidate endpoint and writes `out/eval-report.md` for side-by-side human review |

## 1. Check whether there's enough data

```sh
curl -H "Authorization: Bearer $TRAINING_ADMIN_TOKEN" https://www.zcan.dev/api/training/stats
```

This returns counts only (total, by agent, by locale, by rating, and the oldest and newest dates).
It never returns content. Like the export, it answers 404 when the token is wrong or training is off.

**When to start (rough guidance, not a rule):** a few hundred good, complete runs per agent family
is a reasonable point to try a first LoRA. Quality matters far more than count:

- 200 accurate, well-sourced reports beat 2,000 mediocre ones.
- A thumbs-up rating is a weak signal. Read a sample yourself.
- Agents with very few runs gain little from fine-tuning. Leave them on the base model, or
  evaluate them separately.
- If one locale dominates, expect the tuned model to get worse in the others. The eval below will show it.

## 2. Prepare the data

```sh
export TRAINING_ADMIN_TOKEN=…            # from your password manager; never pass it as an argument
node scripts/finetune/prepare.mjs        # ZCAN_URL defaults to https://www.zcan.dev
# or, from an export you already downloaded:
node scripts/finetune/prepare.mjs --in zcan-training.jsonl
```

Options (environment): `KIND=run|plan|all` (default `all`), `RATING=any|up`, `EVAL_FRACTION` (0.1),
`MIN_REPORT_CHARS` (600), `SEED`.

`prepare.mjs`:

- **Checks the chat format.** It starts with system and user messages, every tool call is answered,
  tool arguments are valid JSON, and the run ends in a final assistant answer.
- **Drops rows that aren't usable:** duplicates, short or cut-off reports, reports without Markdown
  headings, and plans that aren't valid JSON.
- **Drops rows that still look like they contain personal data.** That means emails, wallet addresses
  and IPs the server's anonymizer should already have removed. If any are dropped, the anonymizer
  missed something: fix it in `src/lib/training.ts` before you train.
- **Splits about 90/10 into train and eval,** stratified by agent and grouped by contribution, so a
  run's plan and its report always land on the same side.

The output files use the OpenAI chat fine-tuning format: `{"messages": [...], "tools": [...]}` per line,
with no extra keys.

## 3. Privacy checklist (before every training run)

- [ ] Read a random sample of at least 50 rows from `out/train.jsonl` by eye. Check for names, street
      addresses, phone numbers, usernames and handles, and anything the anonymizer can't catch
      (for example "my ex who works at …").
- [ ] Check that `summary.json` shows no `possible personal data` drops. If it does, fix the
      anonymizer, re-export and re-run.
- [ ] Check that only shareable agents appear (Exposure Scout and Data Broker Remover are never shareable).
- [ ] Drop any row you're unsure about. There is no "probably fine".
- [ ] If people withdrew shares since your last export, re-export rather than reusing old files.
- [ ] Delete `out/` and any copies (including files uploaded to a provider) once a model is trained,
      and keep only what you need to reproduce it.
- [ ] Check the provider's data-retention terms. Prefer providers that let you delete uploaded files and
      that don't train on customer data.

## 4. Fine-tune

The agents call a web-search tool and ask for JSON plans. **The base model must support tool calling
and JSON output**, and keep that ability after tuning, so keep the `tools` in the training rows.

Options (check each provider's current docs and supported-model list; these change often):

- **Hosted LoRA fine-tuning on an open-weight model:**
  - **Together AI** supports LoRA fine-tuning (its default mode) on chat data with `tool_calls` and
    `tool` messages, and serves the result on a dedicated endpoint.
    See its [function-calling fine-tuning guide](https://docs.together.ai/docs/fine-tuning/function-calling).
  - **Fireworks AI** supports LoRA supervised fine-tuning on OpenAI-format chat JSONL, including tools
    and multi-turn tool calls. See its [supervised fine-tuning guide](https://docs.fireworks.ai/fine-tuning/supervised-fine-tuning).
  - **OpenPipe** offers a similar managed workflow (dataset → fine-tune → hosted endpoint). Check its
    docs for the current base models and tool-call support.
- **Self-hosted training:** use [Unsloth](https://github.com/unslothai/unsloth) or
  [axolotl](https://github.com/axolotl-ai-cloud/axolotl) to train a LoRA on a rented GPU. Use a base
  model whose chat template handles tools.

Start with a mid-sized instruct model that already does tool calling well. Run one small epoch,
evaluate, and only then scale up.

## 5. Serve

- **Provider endpoint:** the fine-tuning host serves the model behind an OpenAI-compatible API.
- **Self-hosted:** [vLLM](https://docs.vllm.ai/)'s OpenAI-compatible server (`vllm serve …`). For tool
  calling it needs `--enable-auto-tool-choice` with the right `--tool-call-parser` for the model family.
  A LoRA can be loaded with `--lora-modules name=path`. Send a request with tools to the adapter before
  you switch: check that tool calls come back parsed and that `response_format: json_object` works.

## 6. Evaluate before switching

```sh
BASE_URL=https://api.deepseek.com BASE_KEY=… BASE_MODEL=deepseek-v4-pro \
CAND_URL=https://your-endpoint.example/v1 CAND_KEY=… CAND_MODEL=zcan-privacy-v1 \
node scripts/finetune/eval.mjs --limit 30          # add BLIND=1 to hide which model is which
```

`eval.mjs` replays each eval example up to its final answer, with the same search results, and asks
both models for the answer (`tool_choice: "none"`). It writes `out/eval-report.md` with the request,
the shared reference answer and both answers. Read it yourself and check:

- facts and URLs (open them);
- the report format and the language;
- no invented listings or opt-out links;
- no personal data copied into the report.

Keys come from the environment only and are never printed or written to the report.

## 7. Switch

In Vercel → Project → Settings → Environment Variables, set:

| Variable | Value |
|---|---|
| `AI_BASE_URL` | the endpoint, e.g. `https://your-endpoint.example/v1` |
| `AI_API_KEY` | its key |
| `AI_MODEL` | the fine-tuned model or adapter name |
| `AI_PLAN_MODEL` | optional: a faster model for plans (defaults to `AI_MODEL`) |
| `NEXT_PUBLIC_AI_MODEL_NAME` | the name shown in the UI, e.g. `Zcan Privacy Model` |

Then redeploy. `NEXT_PUBLIC_*` values are inlined at build time. Afterwards, check that `/status`
reports the agents as configured, and run one agent of each kind by hand.

### `NEXT_PUBLIC_AI_SELF_HOSTED`: only when it's true

Set `NEXT_PUBLIC_AI_SELF_HOSTED=true` **only** when the model endpoint runs on infrastructure Zcan
controls, such as your own GPU server or a private deployment you operate. It switches on wording
that says agent questions never leave Zcan's servers.

A third-party fine-tuning host serving *your* model (Together, Fireworks, OpenPipe or any other API)
**does not count**. The requests still go to that company, so the claim would be false. Leave the
variable unset in that case.
