// Fonction serveur « comptes » : permet aux parents de changer le mot de passe du compte Grands-parents.
// À déployer sur le projet Supabase des parents. Elle vérifie que la demande vient bien du compte Parents.
import { createClient } from "npm:@supabase/supabase-js@2";

const PARENTS = "parents.hortense@example.com";
const GRANDS_PARENTS = "grandsparents.hortense@example.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erreur: "méthode" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY"))!);

  // Qui fait la demande ? Seul le compte Parents a le droit
  const jeton = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const { data: qui } = await admin.auth.getUser(jeton);
  if (qui?.user?.email !== PARENTS) return json({ erreur: "réservé aux parents" }, 403);

  const { compte, mot_de_passe } = await req.json().catch(() => ({}));
  if (compte !== "famille" || typeof mot_de_passe !== "string" || mot_de_passe.length < 8)
    return json({ erreur: "demande invalide" }, 400);

  // Retrouve le compte Grands-parents et change son mot de passe
  const { data: liste, error } = await admin.auth.admin.listUsers({ perPage: 50 });
  if (error) return json({ erreur: "liste" }, 500);
  const gp = liste.users.find((u) => u.email === GRANDS_PARENTS);
  if (!gp) return json({ erreur: "compte grands-parents introuvable" }, 404);
  const { error: e2 } = await admin.auth.admin.updateUserById(gp.id, { password: mot_de_passe });
  if (e2) return json({ erreur: "mise à jour" }, 500);
  return json({ ok: true });
});
