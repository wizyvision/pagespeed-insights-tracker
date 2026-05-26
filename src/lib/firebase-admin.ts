import { readFileSync } from "fs";
import {
  initializeApp,
  getApps,
  applicationDefault,
  cert,
  type ServiceAccount,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const METRICS_COLLECTION = "psiSites";

function resolveProjectId(): string | undefined {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT
  );
}

function hasExplicitCredentials(): boolean {
  return (
    Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY) ||
    Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  );
}

function parseServiceAccount(
  raw: ServiceAccount & { project_id?: string },
  fallbackProjectId: string
): ServiceAccount {
  return {
    ...raw,
    projectId: raw.projectId ?? raw.project_id ?? fallbackProjectId,
  };
}

function loadServiceAccountFromFileOrEnv(projectId: string): ServiceAccount {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (inlineJson) {
    return parseServiceAccount(
      JSON.parse(inlineJson) as ServiceAccount & { project_id?: string },
      projectId
    );
  }

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    throw new Error(
      "Set GOOGLE_APPLICATION_CREDENTIALS (local dev only) or FIREBASE_SERVICE_ACCOUNT_KEY."
    );
  }

  try {
    const raw = JSON.parse(readFileSync(credentialsPath, "utf8")) as ServiceAccount & {
      project_id?: string;
    };
    return parseServiceAccount(raw, projectId);
  } catch (e) {
    const hint =
      e instanceof Error && "code" in e && e.code === "ENOENT"
        ? ` File not found: ${credentialsPath}`
        : "";
    throw new Error(`Could not read service account at GOOGLE_APPLICATION_CREDENTIALS.${hint}`);
  }
}

export function getAdminApp() {
  if (getApps().length > 0) return getApps()[0]!;

  const projectId = resolveProjectId();

  // Local dev: use downloaded service account JSON via .env
  if (hasExplicitCredentials()) {
    if (!projectId) {
      throw new Error(
        "FIREBASE_PROJECT_ID is required in .env when using GOOGLE_APPLICATION_CREDENTIALS."
      );
    }
    const serviceAccount = loadServiceAccountFromFileOrEnv(projectId);
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId ?? projectId,
    });
  }

  // App Hosting / Cloud Run: built-in service account (no JSON file)
  if (!projectId) {
    throw new Error(
      "FIREBASE_PROJECT_ID is not set. Add it to apphosting.yaml for production or .env for local dev."
    );
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId,
  });
}

export function getDb() {
  getAdminApp();
  return getFirestore();
}

export function metricsCollection(siteId: string) {
  return getDb()
    .collection(METRICS_COLLECTION)
    .doc(siteId)
    .collection("metrics");
}
