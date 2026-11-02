import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { listProductsAdmin } from "@/server/catalog/admin-queries";
import {
  addCollectionProductAction,
  deleteCollectionAction,
  moveCollectionProductAction,
  removeCollectionProductAction,
  updateCollectionAction,
} from "@/server/content/actions";
import { getCollectionAdmin } from "@/server/content/collections";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { CollectionFields } from "@/components/admin/collection-fields";
import { Badge, fieldClass, LinkButton, Page, PageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SEARCH_LIMIT = 20;

export default async function EditCollectionPage({ params, searchParams }: PageProps<"/admin/content/collections/[id]">) {
  await requirePagePermission("content:manage");
  const [{ id }, { q }] = await Promise.all([params, searchParams]);
  const query = typeof q === "string" ? q.trim() : "";
  const [t, td, collection, found] = await Promise.all([
    getTranslations("Content"),
    getTranslations("Docs"),
    getCollectionAdmin(id),
    query ? listProductsAdmin(query) : Promise.resolve([]),
  ]);
  if (!collection) notFound();
  const inCollection = new Set(collection.items.map((i) => i.productId));

  return (
    <Page>
      <PageHeader
        title={`${t("collectionEdit")}: ${collection.nameEn}`}
        back={{ href: "/admin/content/collections", label: td("back") }}
        actions={<LinkButton href={`/en/collection/${collection.slug}`}>{t("viewOnStore")}</LinkButton>}
      />

      <section className="rounded-lg border p-4">
        <ActionForm action={updateCollectionAction} submitLabel={t("save")} okText={t("saved")}>
          <input type="hidden" name="id" value={collection.id} />
          <CollectionFields value={collection} />
        </ActionForm>
      </section>

      <section aria-labelledby="items-h" className="rounded-lg border p-4">
        <h2 id="items-h" className="mb-3 font-medium">
          {t("products")} ({collection.items.length})
        </h2>
        {collection.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("productsEmpty")}</p>
        ) : (
          <ol className="space-y-2">
            {collection.items.map((item, i) => (
              <li key={item.productId} data-testid="collection-item" className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
                <span className="w-6 text-right text-muted-foreground tabular-nums">{i + 1}.</span>
                <span className="min-w-48 flex-1">
                  {item.name} <span className="font-mono text-xs text-muted-foreground">{item.slug}</span>
                </span>
                {!item.published && <Badge tone="warning">{t("hiddenProduct")}</Badge>}
                {i > 0 && (
                  <ActionButton
                    action={moveCollectionProductAction}
                    fields={{ id: collection.id, productId: item.productId, direction: "up" }}
                    label={`↑ ${t("up")}`}
                    variant="outline"
                  />
                )}
                {i < collection.items.length - 1 && (
                  <ActionButton
                    action={moveCollectionProductAction}
                    fields={{ id: collection.id, productId: item.productId, direction: "down" }}
                    label={`↓ ${t("down")}`}
                    variant="outline"
                  />
                )}
                <ActionButton
                  action={removeCollectionProductAction}
                  fields={{ id: collection.id, productId: item.productId }}
                  label={t("remove")}
                  variant="destructive"
                />
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="add-h" className="rounded-lg border p-4">
        <h2 id="add-h" className="mb-3 font-medium">
          {t("addProducts")}
        </h2>
        <form className="mb-3 flex flex-wrap gap-2">
          <input name="q" type="search" defaultValue={query} placeholder={t("searchProducts")} aria-label={t("searchProducts")} className={cn(fieldClass, "max-w-sm")} />
          <Button size="lg" type="submit" variant="outline">
            {t("search")}
          </Button>
        </form>
        {query && (
          <ul className="space-y-1">
            {found.slice(0, SEARCH_LIMIT).map((p) => (
              <li key={p.id} data-testid="product-result" className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-48 flex-1">
                  {p.name} <span className="font-mono text-xs text-muted-foreground">{p.slug}</span>
                </span>
                {!p.published && <Badge tone="warning">{t("hiddenProduct")}</Badge>}
                {inCollection.has(p.id) ? (
                  <Badge tone="success">{t("inCollection")}</Badge>
                ) : (
                  <ActionButton action={addCollectionProductAction} fields={{ id: collection.id, productId: p.id }} label={t("add")} variant="outline" />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ActionButton
        action={deleteCollectionAction}
        fields={{ id: collection.id }}
        label={t("deleteCollection")}
        variant="destructive"
        confirm={t("deleteCollectionConfirm")}
      />
    </Page>
  );
}
