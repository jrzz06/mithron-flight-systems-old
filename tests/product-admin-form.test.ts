import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProductCategoryMetadataFromFormData, buildProductDraftFromFormData, buildProductQuickEditFromFormData } from "@/services/product-admin-forms";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("product admin draft form", () => {
  it("maps compact product edits into a patch-only workflow input", () => {
    expect(buildProductQuickEditFromFormData(formData({
      product_slug: "source-v9-flight-controller-for-agriculture-drones",
      name: "V9 Flight Controller for Agriculture Drones",
      tagline: "Precision flight control",
      category: "Accessories",
      price: "33000",
      source_availability: "InStock",
      change_summary: "Quick edit selected product"
    }))).toEqual({
      table: "mithron_products",
      identity: {
        slug: "source-v9-flight-controller-for-agriculture-drones"
      },
      fields: {
        name: "V9 Flight Controller for Agriculture Drones",
        tagline: "Precision flight control",
        category: "Accessories",
        price: 33000,
        source_availability: "InStock"
      },
      entityId: "source-v9-flight-controller-for-agriculture-drones",
      changeSummary: "Quick edit selected product"
    });
  });

  it("unsets charge_tax and show_price_per_unit when companion present fields are set", () => {
    const result = buildProductQuickEditFromFormData(formData({
      product_slug: "source-v9-flight-controller-for-agriculture-drones",
      charge_tax_present: "1",
      show_price_per_unit_present: "1"
    }));
    expect(result.fields.charge_tax).toBe(false);
    expect(result.fields.show_price_per_unit).toBe(false);
  });

  it("does not patch description unless the description editor was rendered", () => {
    const withoutEditor = buildProductQuickEditFromFormData(formData({
      product_slug: "source-v9-flight-controller-for-agriculture-drones",
      name: "V9 Flight Controller for Agriculture Drones",
      description_json: JSON.stringify({ type: "doc", content: [] })
    }));

    expect(withoutEditor.fields.description).toBeUndefined();
    expect(withoutEditor.fields.description_json).toBeUndefined();
  });

  it("saves description fields when the description editor is present", () => {
    const withEditor = buildProductQuickEditFromFormData(formData({
      product_slug: "source-v9-flight-controller-for-agriculture-drones",
      description_editor_present: "1",
      description_json: JSON.stringify({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Field-ready platform" }] }]
      })
    }));

    expect(withEditor.fields.description).toContain("Field-ready platform");
    expect(withEditor.fields.description_json).toMatchObject({ type: "doc" });
  });

  it("rejects compact product edits with no patch fields", () => {
    expect(() => buildProductQuickEditFromFormData(formData({
      product_slug: "source-v9-flight-controller-for-agriculture-drones"
    }))).toThrow("Product quick edit requires at least one field to update.");
  });

  it("maps mithron_products form data into an auditable draft workflow input", () => {
    expect(buildProductDraftFromFormData(formData({
      slug: "source-agri-kisan-drone-small-8-liter",
      name: "Agri Kisan Drone Small",
      tagline: "Compact field deployment platform",
      price: "120000",
      compare_at: "149000",
      badge_text: "New",
      badge_style: "success",
      category: "Agri Drones",
      interests: "agriculture, smart-farming",
      image: "{\"src\":\"/assets/products/agri-8l.webp\",\"alt\":\"Agri Kisan Drone Small\"}",
      hero: "{\"src\":\"/assets/products/agri-8l-hero.webp\",\"alt\":\"Agri Kisan Drone Small\"}",
      gallery: "[{\"src\":\"/assets/products/agri-8l.webp\",\"alt\":\"Agri Kisan Drone Small\"}]",
      hotspots: "[]",
      variants: "[{\"id\":\"base\",\"name\":\"Base\",\"tone\":\"#f2f4f6\"}]",
      bundles: "[]",
      story: "[{\"id\":\"overview\",\"title\":\"Overview\",\"body\":\"Field-ready platform\"}]",
      specs: "{\"Flight time\":\"42 min\"}",
      anchors: "Overview, Specs",
      product_url: "/product/source-agri-kisan-drone-small-8-liter",
      sort_order: "10",
      source_url: "https://example.com/products/agri-kisan-drone-small",
      source_catalog_id: "AG-8L",
      source_description: "Source catalog description",
      source_images: "[{\"src\":\"/assets/products/agri-8l.webp\",\"width\":1200,\"height\":900}]",
      source_availability: "in_stock",
      source_currency: "INR",
      change_summary: "Draft product from admin product form"
    }))).toEqual({
      table: "mithron_products",
      identity: {
        slug: "source-agri-kisan-drone-small-8-liter"
      },
      fields: {
        name: "Agri Kisan Drone Small",
        tagline: "Compact field deployment platform",
        price: 120000,
        compare_at: 149000,
        badge_enabled: true,
        badge_text: "New",
        badge_style: "success",
        badge: "New",
        description: null,
        description_json: null,
        on_sale: false,
        discount_type: null,
        discount_value: null,
        cost_of_goods: null,
        show_price_per_unit: false,
        charge_tax: true,
        tax_group: "products-default",
        tax_rate: 18,
        tax_included: false,
        category: "Agri Drones",
        interests: ["agriculture", "smart-farming"],
        image: {
          src: "/assets/products/agri-8l.webp",
          alt: "Agri Kisan Drone Small"
        },
        hero: {
          src: "/assets/products/agri-8l-hero.webp",
          alt: "Agri Kisan Drone Small"
        },
        gallery: [{
          src: "/assets/products/agri-8l.webp",
          alt: "Agri Kisan Drone Small"
        }],
        hotspots: [],
        variants: [{
          id: "base",
          name: "Base",
          tone: "#f2f4f6"
        }],
        bundles: [],
        story: [{
          id: "overview",
          title: "Overview",
          body: "Field-ready platform"
        }],
        specs: {
          "Flight time": "42 min"
        },
        anchors: ["Overview", "Specs"],
        product_url: "/product/source-agri-kisan-drone-small-8-liter",
        source_url: "https://example.com/products/agri-kisan-drone-small",
        source_catalog_id: "AG-8L",
        source_description: "Source catalog description",
        source_images: [{
          src: "/assets/products/agri-8l.webp",
          width: 1200,
          height: 900
        }],
        source_availability: "in_stock",
        source_currency: "INR"
      },
      entityId: "source-agri-kisan-drone-small-8-liter",
      sortOrder: 10,
      changeSummary: "Draft product from admin product form"
    });
  });

  it("maps the minimal add-product form and derives a slug from the name", () => {
    const supabaseImage =
      "https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/media/products/agri-8l.webp";
    expect(buildProductDraftFromFormData(formData({
      name: "Agri Kisan Drone Small",
      category: "Agri Drones",
      price: "120000",
      image_src: supabaseImage,
      source_availability: "InStock",
      change_summary: "Add product from admin catalog"
    }))).toMatchObject({
      table: "mithron_products",
      identity: {
        slug: "agri-kisan-drone-small"
      },
      fields: {
        name: "Agri Kisan Drone Small",
        tagline: "Agri Kisan Drone Small catalog product",
        price: 120000,
        category: "Agri Drones",
        image: {
          src: supabaseImage,
          alt: "Agri Kisan Drone Small",
          kind: "image"
        },
        source_availability: "InStock"
      },
      entityId: "agri-kisan-drone-small",
      changeSummary: "Add product from admin catalog"
    });
  });

  it("maps direct category adds into category_metadata without requiring a product draft", () => {
    expect(buildProductCategoryMetadataFromFormData(formData({
      category_title: "Payload Systems",
      sort_order: "90"
    }))).toEqual({
      table: "category_metadata",
      identity: {
        route_key: "payload-systems"
      },
      fields: {
        title: "Payload Systems",
        subtitle: "Payload Systems catalog category.",
        hero_image: "/media/mithron/hero/mapping-flight.webp",
        showcase_image: null,
        personality: null,
        featured_product_slugs: [],
        ecosystem_payload: {
          source: "admin-products",
          created_from: "direct-category-add"
        },
        is_visible: true,
        status: "published"
      },
      entityId: "payload-systems",
      sortOrder: 90,
      changeSummary: "Add category Payload Systems from admin catalog"
    });
  });

  it("wires the draft-only product form to the server action and admin page without changing storefront loaders", () => {
    const pageSource = readFileSync(join(process.cwd(), "app/admin/products/page.tsx"), "utf8");
    const actionSource = readFileSync(join(process.cwd(), "app/admin/products/actions.ts"), "utf8");

    expect(pageSource).toContain("saveProductDraftFormAction");
    expect(pageSource).toContain("data-product-table=\"mithron_products\"");
    expect(pageSource).toContain("data-product-create-panel");
    expect(pageSource).toContain("data-product-create-primary-fields");
    expect(pageSource).toContain("data-product-create-media-fields");
    expect(pageSource).toContain("data-product-create-submit-bar");
    expect(pageSource).toContain("ProductCategoryField");
    expect(pageSource).toContain("buildProductCategoryOptions");
    expect(pageSource).toContain("data-product-add-category-shortcut");
    expect(pageSource).toContain("tool=category#product-category");
    expect(pageSource).toContain("activeTool === \"category\"");
    expect(pageSource).toContain("data-product-category-create-panel");
    expect(pageSource).toContain("data-product-category-name-input");
    expect(pageSource).toContain("data-product-category-route-input");
    expect(pageSource).toContain("data-product-category-submit-bar");
    expect(pageSource).not.toContain("category_mode=new#create-product");
    expect(pageSource).not.toContain("startAddingCategory=");
    expect(pageSource).toContain("deleteProductCategoryFormAction");
    expect(pageSource).toContain("ProductMultiImageField");
    expect(pageSource).toContain("data-product-create-media-fields");
    const multiImageFieldSource = readFileSync(join(process.cwd(), "components/products/product-multi-image-field.tsx"), "utf8");
    const imageFileInputSource = readFileSync(join(process.cwd(), "components/products/product-image-file-input.tsx"), "utf8");
    expect(imageFileInputSource).toContain('name="image_files"');
    expect(imageFileInputSource).toContain("multiple");
    expect(multiImageFieldSource).toContain('name="gallery_urls"');
    expect(pageSource).toContain("data-product-supabase-storage-note");
    expect(actionSource).toContain("buildProductCategoryMetadataFromFormData");
    expect(actionSource).toContain("saveProductCategoryFormAction");
    expect(actionSource).toContain("upsertAdminRecord");
    expect(actionSource).toContain("\"category_metadata\"");
    expect(actionSource).toContain("\"route_key\"");
    expect(actionSource).toContain("buildProductDraftFromFormData");
    expect(actionSource).toContain("saveProductDraftFormAction");
    expect(actionSource).toContain("deleteProductCategoryFormAction");
    expect(actionSource).toContain("deleteAdminRecord(\"category_metadata\", \"route_key\"");
    expect(actionSource).toContain("Move or edit those products before deleting the category.");
    expect(actionSource).toContain("uploadProductImagesForDraft");
    expect(actionSource).toContain("linkUploadedImagesToProduct");
    expect(actionSource).toContain("Add an image by uploading a local file or pasting an image URL.");
    expect(actionSource).toContain("upsertProductMediaAssetRecord");
    expect(actionSource).not.toContain("getProducts()");

    const categoryFieldSource = readFileSync(join(process.cwd(), "components/products/product-category-field.tsx"), "utf8");
    expect(categoryFieldSource).toContain("data-product-delete-category-action");
    expect(categoryFieldSource).toContain("data-product-category-usage");
    expect(categoryFieldSource).toContain("name=\"category_route_key\"");
    expect(categoryFieldSource).not.toContain("data-product-add-category-action");
    expect(categoryFieldSource).not.toContain("startAddingCategory");
    expect(categoryFieldSource).not.toContain("data-product-new-category-panel");
    expect(categoryFieldSource).not.toContain("name=\"new_category\"");
    expect(categoryFieldSource).not.toContain("name=\"category_mode\"");
  });

  it("wires compact edit to a patch-only action instead of the draft form", () => {
    const pageSource = readFileSync(join(process.cwd(), "app/admin/products/page.tsx"), "utf8");
    const gridSource = readFileSync(join(process.cwd(), "app/admin/products/product-catalog-grid.tsx"), "utf8");
    const dialogSource = readFileSync(join(process.cwd(), "app/admin/products/product-detail-edit-dialog.tsx"), "utf8");
    const actionSource = readFileSync(join(process.cwd(), "app/admin/products/actions.ts"), "utf8");

    expect(pageSource).toContain("ProductCatalogGrid");
    expect(pageSource).toContain("categoryOptions={categoryOptions}");
    expect(pageSource).toContain("deleteCategoryAction={deleteProductCategoryFormAction}");
    expect(gridSource).toContain("ProductDetailEditDialog");
    expect(gridSource).toContain("categoryOptions={categoryOptions}");
    expect(gridSource).toContain("deleteCategoryAction={deleteCategoryAction}");
    expect(dialogSource).toContain("ProductCategoryField");
    expect(dialogSource).toContain("defaultCategory={editorProduct.category}");
    expect(dialogSource).toContain("saveProductQuickEditClientAction");
    expect(dialogSource).toContain("fetchProductEditorDetailForQuickEditAction");
    expect(dialogSource).toContain("data-product-quick-edit");
    expect(dialogSource).toContain("description_editor_present");
    expect(dialogSource).toContain("defaultJson={editorProduct.descriptionJson");
    expect(dialogSource).toContain("id=\"update-product\"");
    expect(dialogSource).toContain("name=\"product_slug\" value={product.id}");
    expect(dialogSource).toContain("type=\"hidden\" name=\"change_summary\"");
    expect(pageSource).not.toContain("<span id=\"update-product\"");
    expect(actionSource).toContain("buildProductQuickEditFromFormData");
    expect(actionSource).toContain("saveProductQuickEditFormAction");
    expect(actionSource).toContain("saveProductQuickEditClientAction");
    expect(actionSource).toContain("fetchProductEditorDetailForQuickEditAction");
    expect(actionSource).toContain("products.quick_edit");
    expect(actionSource).toContain("revalidateCatalogSurfaces(quickInput.identity.slug)");
  });

  it("exposes row-level product delete while keeping parser confirmation deterministic", () => {
    const pageSource = readFileSync(join(process.cwd(), "app/admin/products/page.tsx"), "utf8");
    const actionSource = readFileSync(join(process.cwd(), "app/admin/products/actions.ts"), "utf8");
    const formSource = readFileSync(join(process.cwd(), "services/product-admin-forms.ts"), "utf8");
    const gridSource = readFileSync(join(process.cwd(), "app/admin/products/product-catalog-grid.tsx"), "utf8");

    expect(gridSource).toContain("confirm_slug");
    expect(gridSource).toContain("data-product-delete-modal");
    expect(pageSource).not.toContain("Hard delete product");
    expect(pageSource).not.toContain("data-product-row-action=\"hard-delete\"");
    expect(gridSource).toContain("data-product-delete-modal");
    expect(actionSource).toContain("saveProductHardDeleteFormAction");
    expect(actionSource).toContain("saveProductDuplicateFormAction");
    expect(actionSource).toContain("buildProductDeleteFromFormData");
    expect(formSource).toContain("Product delete confirmation must match the product slug exactly.");
  });
});
