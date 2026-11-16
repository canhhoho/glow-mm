import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
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
import { localizedPath } from "@/lib/site";
import { Badge, EmptyState, FilterBar, FilterButton, LinkButton, Page, PageHeader, SearchInput, Section } from "@/components/admin/ui";

const SEARCH_LIMIT = 20;

export default async function EditCollectionPage({ params, searchParams }: PageProps<"/admin/content/collections/[id]">) {
  await requirePagePermission("content:manage");
  const [{ id }, { q }] = await Promise.all([params, searchParams]);
  const query = typeof q === "string" ? q.trim() : "";
  const [t, td, collection, found] = await Promise.all([
    getTranslations("Content"),
    getTranslations("Docs"),
    getCollectionAdmin(id),
    query ? listProductsAdmin({ q: query }) : Promise.resolve([]),
  ]);
  if (!collection) notFound();
  const inCollection = new Set(collection.items.map((i) => i.productId));

  return (
    <Page>
      <PageHeader
        title={`${t("collectionEdit")}: ${collection.nameEn}`}
        back={{ href: "/admin/content/collections", label: td("back") }}
        actions={<LinkButton href={localizedPath("en", `/collection/${collection.slug}`)} icon="view">{t("viewOnStore")}</LinkButton>}
      />

      <Section>
        <ActionForm action={updateCollectionAction} submitLabel={t("save")} okText={t("saved")}>
          <input type="hidden" name="id" value={collection.id} />
          <CollectionFields value={collection} />
        </ActionForm>
      </Section>

      <Section title={<>{t("products")} ({collection.items.length}) · {t("visibleOnStore", { n: collection.items.filter((i) => i.visible).length })}</>}>
        {collection.items.length === 0 ? (
          <EmptyState>{t("productsEmpty")}</EmptyState>
        ) : (
          <ol className="space-y-2">
            {collection.items.map((item, i) => (
              <li key={item.productId} data-testid="collection-item" className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
                <span className="w-6 text-right text-muted-foreground tabular-nums">{i + 1}.</span>
                <span className="min-w-48 flex-1">
                  {item.name} <span className="font-mono text-xs text-muted-foreground">{item.slug}</span>
                </span>
                {item.archived ? <Badge tone="danger">{t("archivedProduct")}</Badge> : !item.published && <Badge tone="warning">{t("hiddenProduct")}</Badge>}
                {i > 0 && (
                  <ActionButton
                    action={moveCollectionProductAction}
                    fields={{ id: collection.id, productId: item.productId, direction: "up" }}
        label={t("up")}
                    icon={<ArrowUp aria-hidden />}
                    iconOnly={false}
                    variant="outline"
                  />
                )}
                {i < collection.items.length - 1 && (
                  <ActionButton
                    action={moveCollectionProductAction}
                    fields={{ id: collection.id, productId: item.productId, direction: "down" }}
                    label={t("down")}
                    icon={<ArrowDown aria-hidden />}
                    iconOnly={false}
                    variant="outline"
                  />
                )}
                <ActionButton
                  action={removeCollectionProductAction}
                  fields={{ id: collection.id, productId: item.productId }}
                  label={t("remove")}
                  variant="destructive" iconOnly={true} icon={<Trash2 aria-hidden />}
                />
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title={t("addProducts")}>
        <FilterBar>
          <SearchInput label={t("searchProducts")} defaultValue={query} />
          <FilterButton>{t("search")}</FilterButton>
        </FilterBar>
        {query && found.length === 0 && <EmptyState>{(await getTranslations("Common"))("noData")}</EmptyState>}
        {query && found.length > 0 && (
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
                  <ActionButton action={addCollectionProductAction} fields={{ id: collection.id, productId: p.id }} label={t("add")} variant="outline" iconOnly={false} icon={<Plus aria-hidden />} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <ActionButton
        action={deleteCollectionAction}
        fields={{ id: collection.id }}
        label={t("deleteCollection")}
        variant="destructive"
        confirm={t("deleteCollectionConfirm")} iconOnly={false} icon={<Trash2 aria-hidden />}
      />
    </Page>
  );
}
