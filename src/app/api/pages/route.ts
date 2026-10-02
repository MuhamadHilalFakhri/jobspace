import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import {
  createPage,
  getPageWithBlocks,
  listPages,
  saveBlocks,
  updatePageMeta,
  deletePage,
} from "@/lib/services/jobs.service";
import { createPageSchema, pageMetaSchema, saveBlocksSchema, uuidSchema } from "@/lib/domain/validation";
import { readBoundedRequest } from "@/lib/bounded-request";

export const dynamic = "force-dynamic";

/** GET /api/pages or /api/pages?id= (with blocks) */
export const GET = withUser(async (user, req: NextRequest) => {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    uuidSchema.parse(id);
    const detail = await getPageWithBlocks(user.id, id);
    return NextResponse.json(detail);
  }
  const items = await listPages(user.id);
  return NextResponse.json({ items });
});

/** POST /api/pages — create page */
export const POST = withUser(async (user, req: NextRequest) => {
  const body = await (await readBoundedRequest(req, 32 * 1024)).json();
  const input = createPageSchema.parse(body);
  const id = await createPage(user.id, input);
  return NextResponse.json({ id }, { status: 201 });
});

/** PUT /api/pages?id= — replace page blocks */
export const PUT = withUser(async (user, req: NextRequest) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });
  uuidSchema.parse(id);
  const body = await (await readBoundedRequest(req, 2 * 1024 * 1024)).json();
  const input = saveBlocksSchema.parse(body);
  await saveBlocks(user.id, id, input.blocks);
  return NextResponse.json({ ok: true });
});

/** PATCH /api/pages?id= — rename / re-icon a page. */
export const PATCH = withUser(async (user, req: NextRequest) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });
  uuidSchema.parse(id);
  const body = await (await readBoundedRequest(req, 32 * 1024)).json();
  const input = pageMetaSchema.partial().parse(body);
  await updatePageMeta(user.id, id, input);
  return NextResponse.json({ ok: true });
});

/** DELETE /api/pages?id= — soft-delete a page. */
export const DELETE = withUser(async (user, req: NextRequest) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });
  uuidSchema.parse(id);
  await deletePage(user.id, id);
  return NextResponse.json({ ok: true });
});
