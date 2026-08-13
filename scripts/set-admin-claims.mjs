import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const [email, salonId] = process.argv.slice(2);
const projectId = process.env.FIREBASE_PROJECT_ID;

if (!email || !salonId) {
  throw new Error("Uso: npm run firebase:set-admin -- email@exemplo.com identificador-do-salao");
}

if (!projectId) {
  throw new Error("FIREBASE_PROJECT_ID não está configurado no arquivo .env.local.");
}

const app =
  getApps()[0] ??
  initializeApp({
    credential: applicationDefault(),
    projectId,
  });

const auth = getAuth(app);
const user = await auth.getUserByEmail(email);

await auth.setCustomUserClaims(user.uid, {
  ...(user.customClaims ?? {}),
  admin: true,
  salonId,
});

console.log("Permissões administrativas configuradas. Entre novamente na aplicação.");
