import * as dotenv from "dotenv";
import * as readline from "readline";
import { SystemProgram, Transaction, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { GeminiAgent, AgentPlan } from "./gemini-agent";
import { SCENARIOS } from "./scenarios";
import {
  secureExecute,
  pollActionStatus,
} from "./security-layer";
import {
  badge,
  color,
  generateUnsignedTransactionDraft,
  label,
  line,
  paint,
  printHeader,
  riskBar,
  section,
  sleep,
  wrapText,
} from "./utils";

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (query: string) =>
  new Promise<string>((resolve) => rl.question(query, resolve));

async function protectIntent(intent: string, actionParams?: any) {
  console.log(`\n${paint("Input intent:", color.yellow)} ${intent}`);

  console.log("");
  console.log(badge(" PROTECTING VIA BENTO GUARD ", color.white, color.bgBlue));

  let transactionBase64: string | undefined = undefined;
  try {
    if (actionParams?.targetAddress && actionParams?.amount) {
      const targetAddress = actionParams.targetAddress;
      const amountSol = typeof actionParams.amount === 'string' ? parseFloat(actionParams.amount) : actionParams.amount;
      const messageV0 = new TransactionMessage({
        payerKey: new PublicKey("11111111111111111111111111111111"),
        recentBlockhash: "11111111111111111111111111111111",
        instructions: [
          SystemProgram.transfer({
            fromPubkey: new PublicKey("11111111111111111111111111111111"),
            toPubkey: new PublicKey(targetAddress),
            lamports: amountSol * 1e9,
          })
        ]
      }).compileToV0Message();
      const tx = new VersionedTransaction(messageV0);
      transactionBase64 = Buffer.from(tx.serialize()).toString("base64");
    }
  } catch (e) {
    // Ignore mock error
  }

  try {
    const analysis = await secureExecute({
      instruction: intent,
      transactionBase64,
    });
    await handleAnalysisResult(analysis);
  } catch (error: any) {
    if (error?.details?.recommendation === "BLOCKED") {
      await handleAnalysisResult(error.details);
      return;
    }

    console.error(`${paint("[ERROR]", color.red)} ${error.message}`);
  }
}

async function handleAnalysisResult(analysis: any) {
  section("Security Report");

  if (analysis.recommendation === "ALLOW") {
    label("Decision", badge("ALLOWED", color.black, color.bgGreen));
    label("Risk", riskBar(analysis.riskScore), color.green);
    printReasoning(analysis.reasoning, color.green);
    return;
  }

  if (analysis.recommendation === "ESCALATED") {
    label("Decision", badge("ESCALATED", color.black, color.bgYellow));
    label("Risk", riskBar(analysis.riskScore), color.yellow);
    printReasoning(analysis.reasoning, color.yellow);

    if (!analysis.actionId) {
      console.log(
        paint("[ERROR] Escalated response is missing actionId.", color.red),
      );
      return;
    }

    await resolveEscalation(analysis);
    return;
  }

  label("Decision", badge("BLOCKED", color.white, color.bgRed));
  label("Risk", riskBar(analysis.riskScore), color.red);
  printReasoning(analysis.reasoning, color.red);
}

function printReasoning(
  reasoning = "No reasoning provided.",
  valueColor = color.white,
) {
  console.log(paint("Reasoning:", color.dim));
  for (const lineText of wrapText(reasoning, 68)) {
    console.log(`  ${paint(lineText, valueColor)}`);
  }
}

async function resolveEscalation(analysis: any) {
  const actionId = analysis.actionId;
  console.log("");
  console.log(badge(" WAITING FOR APPROVAL ", color.black, color.bgYellow));
  console.log("");
  
  if (analysis.reviewUrl) console.log(`👀 Review URL:  ${paint(analysis.reviewUrl, color.cyan)}`);
  if (analysis.approveUrl) console.log(`✅ Approve URL: ${paint(analysis.approveUrl, color.green)}`);
  if (analysis.blockUrl) console.log(`🛑 Block URL:   ${paint(analysis.blockUrl, color.red)}`);

  console.log("");
  console.log(
    paint(
      "Please approve or block this action using the links above or from the Bento Dashboard.",
      color.dim,
    ),
  );

  try {
    // Blocks until the owner approves/blocks or TTL expires
    const status = await pollActionStatus(actionId);
    console.log(
      `${paint("[DASHBOARD]", color.cyan)} Decision received -> ${paint(
        status.final_decision,
        status.final_decision === "ALLOW" ? color.green : color.red,
      )}`,
    );
  } catch (err: any) {
    console.log(paint(`[ERROR] ${err.message}`, color.red));
  }
}

async function runChatAgent() {
  printHeader();

  const agent = new GeminiAgent();
  console.log("");
  label("Mode", "Interactive chat", color.cyan);
  label("Commands", "/exit, /demo", color.dim);
  line();

  let running = true;
  while (running) {
    const input = (
      await askQuestion(`\n${paint("You", color.bold, color.green)}> `)
    ).trim();

    if (!input) {
      continue;
    }

    if (input === "/exit" || input === "/quit") {
      running = false;
      continue;
    }

    if (input === "/demo") {
      await runSequentialDemo();
      continue;
    }

    try {
      const plan = await agent.plan(input);
      await handleAgentPlan(plan);
    } catch (error: any) {
      console.error(`${paint("[AGENT ERROR]", color.red)} ${error.message}`);
    }
  }
}

async function handleAgentPlan(plan: AgentPlan) {
  section("Agent Plan");
  label(
    "Plan type",
    plan.type,
    plan.type === "ACTION" ? color.yellow : color.cyan,
  );
  console.log(paint("Agent message:", color.dim));
  for (const lineText of wrapText(plan.message, 68)) {
    console.log(`  ${paint(lineText, color.cyan)}`);
  }

  if (plan.type !== "ACTION") {
    return;
  }

  console.log(paint("Proposed intent:", color.dim));
  for (const lineText of wrapText(plan.intent, 68)) {
    console.log(`  ${paint(lineText, color.yellow)}`);
  }
  await protectIntent(plan.intent, (plan as any).actionParams);
}

async function runSequentialDemo() {
  printHeader();

  console.log("");
  label("Mode", "Scenario demo", color.cyan);
  label("Scenario count", String(SCENARIOS.length), color.yellow);
  await sleep(1500);

  for (const scenario of SCENARIOS) {
    section(`Scenario ${scenario.id}`);
    label("Name", scenario.name, color.magenta);
    label("Intent", scenario.intent, color.yellow);

    await protectIntent(scenario.intent);

    console.log(paint("\nNext scenario starts in 3s...", color.dim));
    await sleep(3000);
  }

  console.log("");
  console.log(
    badge(" ALL SCENARIOS SECURED BY BENTO GUARD ", color.black, color.bgGreen),
  );
}

async function main() {
  try {
    const appMode = process.env.APP_MODE || "CHAT";
    if (appMode === "DEMO") {
      await runSequentialDemo();
    } else {
      await runChatAgent();
    }
  } finally {
    rl.close();
  }
}

main();
