import { BentoClient, protect, AnalysisResult } from "@bentoguard/sdk";

export interface ProtectInput {
  instruction: string;
}

function assertProtectInput(input: ProtectInput) {
  if (!input.instruction?.trim()) {
    throw new Error("Invalid protect input: instruction is required.");
  }
}

// Store the latest finalize result for each actionId
const finalizeResults = new Map<string, any>();
let patched = false;

function patchBentoClient() {
  if (!BentoClient.isInitialized()) {
    BentoClient.initialize();
  }
  if (patched) return;

  const client = BentoClient.getInstance();

  // Patch appendAndFinalize (On-chain)
  const originalAppendAndFinalize = client.api.appendAndFinalize;
  client.api.appendAndFinalize = async function (data: any, timeout?: number) {
    const res = await originalAppendAndFinalize.call(client.api, data, timeout);
    if (data.action_id) {
      finalizeResults.set(data.action_id.toString(), res);
    }
    return res;
  };

  // Patch streamActionStatus
  const originalStreamActionStatus = client.api.streamActionStatus;
  client.api.streamActionStatus = async function (
    actionId: string,
    timeoutMs?: number,
    onEscalated?: (payload: any) => boolean | void
  ) {
    const cached = finalizeResults.get(actionId.toString());
    if (cached) {
      // Clean up cache
      finalizeResults.delete(actionId.toString());

      const decision = cached.decision?.toUpperCase();
      if (decision === "ALLOW" || decision === "BLOCKED") {
        return {
          final_decision: decision,
          final_score: cached.raw_score ? Math.round((cached.raw_score / 1000) * 10) / 10 : 0,
          reason: cached.reasoning || "",
        };
      }

      if (decision === "ESCALATED") {
        const payload = {
          final_decision: "ESCALATED",
          reason: cached.reasoning || "",
          final_score: cached.raw_score ? Math.round((cached.raw_score / 1000) * 10) / 10 : 0,
          approveUrl: cached.approveUrl,
          blockUrl: cached.blockUrl,
          reviewUrl: cached.reviewUrl,
        };

        let continuePolling = true;
        if (onEscalated) {
          const ret = onEscalated(payload);
          if (ret === false) continuePolling = false;
        }

        if (!continuePolling) {
          return payload;
        }
      }
    }

    // Fallback to original stream action status
    return originalStreamActionStatus.call(client.api, actionId, timeoutMs, onEscalated);
  };

  patched = true;
}

/**
 * CORE INTEGRATION:
 * This is where we plug Bento Guard into the Agent's workflow.
 */
export async function secureExecute(
  input: ProtectInput,
): Promise<AnalysisResult> {
  assertProtectInput(input);

  // Initialize and patch the security engine
  patchBentoClient();

  // 2. CALL THE GUARD: The main protection point
  return await protect(input.instruction, {
    timeout: Number(process.env.BENTO_PROTECT_TIMEOUT_MS || 300000),
    autoPollEscalation: false,
    silent: false,
  });
}

export async function pollActionStatus(actionId: string) {
  patchBentoClient();
  const client = BentoClient.getInstance();
  return await client.streamActionStatus(actionId);
}
