import {
  BASE,
  STEP_POLL_INTERVAL_MS,
  STEP_REQUEST_TIMEOUT_MS,
  delay,
  request,
} from "./http";

export function runLogoUrl(clientId, runId) {
  return `${BASE}/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
    runId
  )}/logo`;
}

export async function getRuns(clientId) {
  const data = await request(`/clients/${encodeURIComponent(clientId)}/runs`);
  return data.runs ?? [];
}

export async function createRun(clientId, topic, options = null) {
  const body = {};
  if (topic && String(topic).trim()) body.topic = String(topic).trim();
  if (options && typeof options === "object") {
    if (options.pipeline_id) body.pipeline_id = options.pipeline_id;
    if (options.manual_inputs) body.manual_inputs = options.manual_inputs;
    if (typeof options.use_location === "boolean") {
      body.use_location = options.use_location;
    }
    if (options.location_value != null) {
      body.location_value = String(options.location_value);
    }
    if (options.logo_base64) body.logo_base64 = options.logo_base64;
    if (options.logo_filename) body.logo_filename = options.logo_filename;
  }
  return request(`/clients/${encodeURIComponent(clientId)}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** archive | unarchive | delete (POST/DELETE — avoids PATCH CORS issues in dev). */
export async function runLifecycleAction(clientId, runId, action) {
  const path = `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
    runId
  )}`;
  if (action === "archive") {
    return request(`${path}/archive`, { method: "POST" });
  }
  if (action === "unarchive") {
    return request(`${path}/unarchive`, { method: "POST" });
  }
  if (action === "delete") {
    return request(path, { method: "DELETE" });
  }
  throw new Error(`Unknown action: ${action}`);
}

/** @deprecated Use runLifecycleAction */
export const runArticleAction = runLifecycleAction;

export async function archiveRun(clientId, runId) {
  return runLifecycleAction(clientId, runId, "archive");
}

export async function unarchiveRun(clientId, runId) {
  return runLifecycleAction(clientId, runId, "unarchive");
}

export async function deleteRun(clientId, runId) {
  return runLifecycleAction(clientId, runId, "delete");
}

export async function updateRunLocation(clientId, runId, { use_location, location_value }) {
  const body = {};
  if (typeof use_location === "boolean") body.use_location = use_location;
  if (location_value != null) body.location_value = String(location_value);
  return request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(runId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

export async function updateSocialRunManualInputs(clientId, runId, manual_inputs) {
  return request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(runId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_manual_inputs",
        manual_inputs,
      }),
    }
  );
}

export async function updateRunPlatforms(clientId, runId, platforms) {
  return request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(runId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platforms }),
    }
  );
}

export async function scheduleRun(clientId, runId, payload) {
  const body =
    typeof payload === "string"
      ? { scheduled_at: payload }
      : payload && typeof payload === "object"
        ? { ...payload }
        : {};

  if (!body.scheduled_at && body.platform_schedules && typeof body.platform_schedules === "object") {
    const times = Object.values(body.platform_schedules).filter(
      (value) => typeof value === "string" && value.trim()
    );
    if (times.length) {
      body.scheduled_at = times.sort()[0];
    }
  }

  const path = `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(runId)}`;
  try {
    return await request(`${path}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = e?.message || String(e);
    if (!msg.includes("(404)")) throw e;
    return request(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
}

export async function getRun(clientId, runId, signal = null) {
  return request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(runId)}`,
    { signal }
  );
}

async function waitForStep(clientId, runId, stepName, signal) {
  const deadline = Date.now() + STEP_REQUEST_TIMEOUT_MS;
  let consecutiveFailures = 0;
  while (Date.now() < deadline) {
    await delay(STEP_POLL_INTERVAL_MS, signal);
    let run;
    try {
      run = await getRun(clientId, runId, signal);
      consecutiveFailures = 0;
    } catch (error) {
      const message = error?.message || String(error);
      if (message === "Stopped by user.") throw error;
      consecutiveFailures += 1;
      if (consecutiveFailures >= 3) throw error;
      continue;
    }
    const status = run?.statuses?.[stepName] || "pending";
    if (status === "done") return run;
    if (status === "error") {
      throw new Error(
        run?.step_errors?.[stepName] || `Step ${stepName} failed.`
      );
    }
    if (status === "pending" || status === "skipped") {
      throw new Error(`Step ${stepName} was cancelled.`);
    }
  }
  throw new Error(`Step ${stepName} did not finish within 15 minutes.`);
}

export async function getArtifact(clientId, runId, stepName) {
  const data = await request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
      runId
    )}/artifacts/${encodeURIComponent(stepName)}`
  );
  return data.content ?? "";
}

export async function saveArtifact(clientId, runId, stepName, content) {
  return request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
      runId
    )}/artifacts/${encodeURIComponent(stepName)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }
  );
}

export async function runStep(
  clientId,
  runId,
  stepName,
  previousArtifact,
  signal
) {
  const result = await request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
      runId
    )}/steps/${encodeURIComponent(stepName)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ previous_artifact: previousArtifact }),
      signal,
      timeoutMs: STEP_REQUEST_TIMEOUT_MS,
    }
  );
  if (result?.accepted) {
    await waitForStep(clientId, runId, stepName, signal);
  }
  return result;
}

export async function cancelStep(clientId, runId, stepName) {
  const path = `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
    runId
  )}/steps/${encodeURIComponent(stepName)}/cancel`;
  try {
    return await request(path, { method: "POST" });
  } catch (e) {
    const msg = e?.message || "";
    if (!msg.includes("(404)")) throw e;
    return request(
      `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(runId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_step", step_name: stepName }),
      }
    );
  }
}

export async function runFullPipeline(clientId, topic) {
  return request(`/clients/${encodeURIComponent(clientId)}/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  });
}

export async function repairFinalOutput(clientId, runId, { full = false } = {}) {
  const q = full ? "?full=1" : "";
  const paths = [
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
      runId
    )}/final-output/repair${q}`,
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
      runId
    )}/artifacts/final_output/repair${q}`,
  ];
  let lastErr;
  for (const path of paths) {
    try {
      const data = await request(path, {
        method: "POST",
        timeoutMs: STEP_REQUEST_TIMEOUT_MS,
      });
      const content = (data?.content ?? "").trim();
      if (content.length < 200) {
        throw new Error(
          "Repair returned empty content — restart python main.py and try again."
        );
      }
      return content;
    } catch (e) {
      lastErr = e;
      if (!String(e?.message || "").includes("404")) throw e;
    }
  }
  throw lastErr || new Error("Repair endpoint not found — restart python main.py");
}
