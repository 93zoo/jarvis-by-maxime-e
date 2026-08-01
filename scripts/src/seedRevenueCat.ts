/**
 * seedRevenueCat — one-shot setup of RevenueCat entities for Forge & Kingdoms.
 *
 * Products:
 *  - gold_pouch_small  (consumable)   — Bourse d'or (petite)
 *  - gold_chest_large  (consumable)   — Coffre d'or (grand)
 *  - forge_premium     (subscription) — Forge Premium mensuel
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/seedRevenueCat.ts
 */
import { getUncachableRevenueCatClient } from "./revenueCatClient";

import {
  listProjects,
  createProject,
  listApps,
  createApp,
  listAppPublicApiKeys,
  listProducts,
  createProduct,
  listEntitlements,
  createEntitlement,
  attachProductsToEntitlement,
  listOfferings,
  createOffering,
  updateOffering,
  listPackages,
  createPackages,
  attachProductsToPackage,
  type App,
  type Product,
  type Project,
  type Entitlement,
  type Offering,
  type Package,
  type CreateProductData,
} from "@replit/revenuecat-sdk";

const APP_STORE_APP_NAME = "Forge & Kingdoms iOS";
const APP_STORE_BUNDLE_ID = "com.forgekingdoms.app";
const PLAY_STORE_APP_NAME = "Forge & Kingdoms Android";
const PLAY_STORE_PACKAGE_NAME = "com.forgekingdoms.app";

const ENTITLEMENT_IDENTIFIER = "premium";
const ENTITLEMENT_DISPLAY_NAME = "Forge Premium";

const OFFERING_IDENTIFIER = "default";
const OFFERING_DISPLAY_NAME = "Boutique de la Forge";

interface ProductSpec {
  identifier: string;
  playStoreIdentifier: string;
  displayName: string;
  title: string;
  type: "consumable" | "subscription";
  duration?: "P1M";
  prices: { amount_micros: number; currency: string }[];
  packageLookupKey: string;
  packageDisplayName: string;
}

const PRODUCT_SPECS: ProductSpec[] = [
  {
    identifier: "gold_pouch_small",
    playStoreIdentifier: "gold_pouch_small",
    displayName: "Bourse d'or (1 000 or)",
    title: "Bourse d'or",
    type: "consumable",
    prices: [
      { amount_micros: 1990000, currency: "USD" }, // $1.99
      { amount_micros: 1990000, currency: "EUR" }, // €1.99
    ],
    packageLookupKey: "gold_small",
    packageDisplayName: "Bourse d'or",
  },
  {
    identifier: "gold_chest_large",
    playStoreIdentifier: "gold_chest_large",
    displayName: "Coffre d'or (6 000 or)",
    title: "Coffre d'or",
    type: "consumable",
    prices: [
      { amount_micros: 6990000, currency: "USD" }, // $6.99
      { amount_micros: 6990000, currency: "EUR" }, // €6.99
    ],
    packageLookupKey: "gold_large",
    packageDisplayName: "Coffre d'or",
  },
  {
    identifier: "forge_premium",
    playStoreIdentifier: "forge_premium:monthly",
    displayName: "Forge Premium (mensuel)",
    title: "Forge Premium",
    type: "subscription",
    duration: "P1M",
    prices: [
      { amount_micros: 4990000, currency: "USD" }, // $4.99
      { amount_micros: 4990000, currency: "EUR" }, // €4.99
    ],
    packageLookupKey: "$rc_monthly",
    packageDisplayName: "Forge Premium mensuel",
  },
];

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

async function seedRevenueCat() {
  const client = await getUncachableRevenueCatClient();

  // The connector project already exists — use the first project.
  const { data: existingProjects, error: listProjectsError } = await listProjects({
    client,
    query: { limit: 20 },
  });
  if (listProjectsError) throw new Error("Failed to list projects");
  const PROJECT_NAME = "Forge & Kingdoms";
  let project: Project | undefined = existingProjects?.items?.find((p) => p.name === PROJECT_NAME);
  if (!project) {
    const { data: newProject, error: createProjectError } = await createProject({
      client,
      body: { name: PROJECT_NAME },
    });
    if (createProjectError) throw new Error("Failed to create project: " + JSON.stringify(createProjectError));
    project = newProject;
    console.log("Created project:", project.id);
  } else {
    console.log("Using project:", project.id, project.name);
  }

  const { data: apps, error: listAppsError } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listAppsError || !apps) throw new Error("Failed to list apps");

  let testStoreApp: App | undefined = apps.items.find((a) => a.type === "test_store");
  let appStoreApp: App | undefined = apps.items.find((a) => a.type === "app_store");
  let playStoreApp: App | undefined = apps.items.find((a) => a.type === "play_store");
  if (!testStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: { name: "Forge & Kingdoms Test", type: "test_store", test_store: {} } as any,
    });
    if (error) throw new Error("Failed to create Test Store app: " + JSON.stringify(error));
    testStoreApp = newApp;
    console.log("Created Test Store app:", testStoreApp.id);
  } else console.log("Test store app:", testStoreApp.id);

  if (!appStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: { name: APP_STORE_APP_NAME, type: "app_store", app_store: { bundle_id: APP_STORE_BUNDLE_ID } },
    });
    if (error) throw new Error("Failed to create App Store app: " + JSON.stringify(error));
    appStoreApp = newApp;
    console.log("Created App Store app:", appStoreApp.id);
  } else console.log("App Store app found:", appStoreApp.id);

  if (!playStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: { name: PLAY_STORE_APP_NAME, type: "play_store", play_store: { package_name: PLAY_STORE_PACKAGE_NAME } },
    });
    if (error) throw new Error("Failed to create Play Store app: " + JSON.stringify(error));
    playStoreApp = newApp;
    console.log("Created Play Store app:", playStoreApp.id);
  } else console.log("Play Store app found:", playStoreApp.id);

  const { data: existingProducts, error: listProductsError } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });
  if (listProductsError) throw new Error("Failed to list products");

  const ensureProduct = async (
    spec: ProductSpec,
    targetApp: App,
    storeIdentifier: string,
    isTestStore: boolean,
  ): Promise<Product> => {
    const existing = existingProducts.items?.find(
      (p) => p.store_identifier === storeIdentifier && p.app_id === targetApp.id,
    );
    if (existing) {
      console.log(`Product ${storeIdentifier} already exists on ${targetApp.type}:`, existing.id);
      return existing;
    }
    const body: CreateProductData["body"] = {
      store_identifier: storeIdentifier,
      app_id: targetApp.id,
      type: spec.type,
      display_name: spec.displayName,
    };
    if (isTestStore) {
      if (spec.type === "subscription" && spec.duration) body.subscription = { duration: spec.duration };
      body.title = spec.title;
    }
    const { data: created, error } = await createProduct({
      client,
      path: { project_id: project.id },
      body,
    });
    if (error) throw new Error(`Failed to create product ${storeIdentifier} on ${targetApp.type}: ` + JSON.stringify(error));
    console.log(`Created product ${storeIdentifier} on ${targetApp.type}:`, created.id);
    return created;
  };

  const productsBySpec: Record<string, { test: Product; ios: Product; android: Product }> = {};
  for (const spec of PRODUCT_SPECS) {
    const test = await ensureProduct(spec, testStoreApp, spec.identifier, true);
    const ios = await ensureProduct(spec, appStoreApp, spec.identifier, false);
    const android = await ensureProduct(spec, playStoreApp, spec.playStoreIdentifier, false);
    productsBySpec[spec.identifier] = { test, ios, android };

    // Test store prices
    const { error: priceError } = await client.post<TestStorePricesResponse>({
      url: "/projects/{project_id}/products/{product_id}/test_store_prices",
      path: { project_id: project.id, product_id: test.id },
      body: { prices: spec.prices },
    });
    if (priceError) {
      if (typeof priceError === "object" && priceError !== null && "type" in priceError && (priceError as any).type === "resource_already_exists") {
        console.log(`Test store prices already exist for ${spec.identifier}`);
      } else {
        throw new Error(`Failed to add test store prices for ${spec.identifier}: ` + JSON.stringify(priceError));
      }
    } else console.log(`Added test store prices for ${spec.identifier}`);
  }

  // Entitlement "premium" → forge_premium only
  let entitlement: Entitlement;
  const { data: existingEntitlements, error: listEntitlementsError } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listEntitlementsError) throw new Error("Failed to list entitlements");
  const existingEnt = existingEntitlements.items?.find((e) => e.lookup_key === ENTITLEMENT_IDENTIFIER);
  if (existingEnt) {
    entitlement = existingEnt;
    console.log("Entitlement already exists:", entitlement.id);
  } else {
    const { data: newEnt, error } = await createEntitlement({
      client,
      path: { project_id: project.id },
      body: { lookup_key: ENTITLEMENT_IDENTIFIER, display_name: ENTITLEMENT_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create entitlement");
    entitlement = newEnt;
    console.log("Created entitlement:", entitlement.id);
  }

  const premium = productsBySpec["forge_premium"];
  const { error: attachEntError } = await attachProductsToEntitlement({
    client,
    path: { project_id: project.id, entitlement_id: entitlement.id },
    body: { product_ids: [premium.test.id, premium.ios.id, premium.android.id] },
  });
  if (attachEntError) {
    if ((attachEntError as any).type === "unprocessable_entity_error") {
      console.log("Premium products already attached to entitlement");
    } else throw new Error("Failed to attach products to entitlement: " + JSON.stringify(attachEntError));
  } else console.log("Attached premium products to entitlement");

  // Offering
  let offering: Offering;
  const { data: existingOfferings, error: listOfferingsError } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listOfferingsError) throw new Error("Failed to list offerings");
  const existingOff = existingOfferings.items?.find((o) => o.lookup_key === OFFERING_IDENTIFIER);
  if (existingOff) {
    offering = existingOff;
    console.log("Offering already exists:", offering.id);
  } else {
    const { data: newOff, error } = await createOffering({
      client,
      path: { project_id: project.id },
      body: { lookup_key: OFFERING_IDENTIFIER, display_name: OFFERING_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create offering");
    offering = newOff;
    console.log("Created offering:", offering.id);
  }
  if (!offering.is_current) {
    const { error } = await updateOffering({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { is_current: true },
    });
    if (error) throw new Error("Failed to set offering as current");
    console.log("Set offering as current");
  }

  // Packages
  const { data: existingPackages, error: listPackagesError } = await listPackages({
    client,
    path: { project_id: project.id, offering_id: offering.id },
    query: { limit: 20 },
  });
  if (listPackagesError) throw new Error("Failed to list packages");

  for (const spec of PRODUCT_SPECS) {
    let pkg: Package;
    const existingPkg = existingPackages.items?.find((p) => p.lookup_key === spec.packageLookupKey);
    if (existingPkg) {
      pkg = existingPkg;
      console.log(`Package ${spec.packageLookupKey} already exists:`, pkg.id);
    } else {
      const { data: newPkg, error } = await createPackages({
        client,
        path: { project_id: project.id, offering_id: offering.id },
        body: { lookup_key: spec.packageLookupKey, display_name: spec.packageDisplayName },
      });
      if (error) throw new Error(`Failed to create package ${spec.packageLookupKey}: ` + JSON.stringify(error));
      pkg = newPkg;
      console.log(`Created package ${spec.packageLookupKey}:`, pkg.id);
    }

    const prods = productsBySpec[spec.identifier];
    const { error: attachPkgError } = await attachProductsToPackage({
      client,
      path: { project_id: project.id, package_id: pkg.id },
      body: {
        products: [
          { product_id: prods.test.id, eligibility_criteria: "all" },
          { product_id: prods.ios.id, eligibility_criteria: "all" },
          { product_id: prods.android.id, eligibility_criteria: "all" },
        ],
      },
    });
    if (attachPkgError) {
      if ((attachPkgError as any).type === "unprocessable_entity_error") {
        console.log(`Package ${spec.packageLookupKey}: products already attached (or incompatible)`);
      } else throw new Error(`Failed to attach products to package ${spec.packageLookupKey}: ` + JSON.stringify(attachPkgError));
    } else console.log(`Attached products to package ${spec.packageLookupKey}`);
  }

  // Public API keys
  const keysFor = async (a: App, label: string) => {
    const { data, error } = await listAppPublicApiKeys({
      client,
      path: { project_id: project.id, app_id: a.id },
    });
    if (error) throw new Error("Failed to list public API keys for " + label);
    return data?.items.map((i) => i.key).join(", ") ?? "N/A";
  };

  console.log("\n====================");
  console.log("RevenueCat setup complete!");
  console.log("Project ID:", project.id);
  console.log("Test Store App ID:", testStoreApp.id);
  console.log("App Store App ID:", appStoreApp.id);
  console.log("Play Store App ID:", playStoreApp.id);
  console.log("Entitlement Identifier:", ENTITLEMENT_IDENTIFIER);
  console.log("Public API Keys - Test Store:", await keysFor(testStoreApp, "test store"));
  console.log("Public API Keys - App Store:", await keysFor(appStoreApp, "app store"));
  console.log("Public API Keys - Play Store:", await keysFor(playStoreApp, "play store"));
  console.log("====================\n");
}

seedRevenueCat().catch((e) => {
  console.error(e);
  process.exit(1);
});
