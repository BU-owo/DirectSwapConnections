/**
 * One-time migration: remove `email` from every /listings doc (it now lives
 * only in /contacts, which is access-controlled). Backfills contacts.email
 * from the listing if the contact record is missing it.
 *
 * Run locally with a Firebase service-account key (never commit it):
 *   npm i --no-save firebase-admin
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node scripts/strip-listing-emails.mjs
 * Add --dry-run to preview.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const dryRun = process.argv.includes("--dry-run");
initializeApp({ credential: applicationDefault(), projectId: "bu-direct-swap" });
const db = getFirestore();

const snap = await db.collection("listings").get();
let stripped = 0, backfilled = 0;
for (const docSnap of snap.docs) {
  const { email } = docSnap.data();
  if (email === undefined) continue;
  const contactRef = db.collection("contacts").doc(docSnap.id);
  const contact = await contactRef.get();
  if (email && !contact.data()?.email) {
    backfilled++;
    if (!dryRun) await contactRef.set({ email }, { merge: true });
  }
  stripped++;
  if (!dryRun) await docSnap.ref.update({ email: FieldValue.delete() });
}
console.log(`${dryRun ? "[dry run] " : ""}listings: ${snap.size}, emails stripped: ${stripped}, contacts backfilled: ${backfilled}`);
