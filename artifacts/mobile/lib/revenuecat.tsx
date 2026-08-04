/**
 * revenuecat — RevenueCat initialization + subscription context.
 * Uses the Test Store key in dev/Expo Go/web, real store keys in production builds.
 */
import React, { createContext, useContext, useEffect } from 'react';
import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import { useMutation, useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { setPremiumActive } from './premiumStatus';

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = 'premium';

/** Gold granted per consumable product identifier. */
export const GOLD_PRODUCTS: Record<string, number> = {
  gold_pouch_small: 1000,
  gold_chest_large: 6000,
};

/** Contents of a resource pack consumable. */
export interface ResourcePackContent {
  name: string;
  /** Feather icon name */
  icon: string;
  /** Short description shown in the boutique */
  tagline: string;
  items: Array<{ resourceId: string; qty: number }>;
}

/**
 * Resource packs granted per consumable product identifier.
 * Product IDs must be created in the RevenueCat dashboard (and App/Play Store)
 * as consumable in-app purchases, then attached to the current Offering.
 */
export const RESOURCE_PRODUCTS: Record<string, ResourcePackContent> = {
  resource_pack_forge: {
    name: 'Pack Forgeron',
    icon: 'tool',
    tagline: 'Matériaux de base en quantité',
    items: [
      { resourceId: 'iron',   qty: 20 },
      { resourceId: 'copper', qty: 15 },
      { resourceId: 'coal',   qty: 25 },
      { resourceId: 'wood',   qty: 15 },
      { resourceId: 'stone',  qty: 10 },
    ],
  },
  resource_pack_rare: {
    name: 'Pack Maître',
    icon: 'tool',
    tagline: 'Alliages & métaux rares',
    items: [
      { resourceId: 'bronze', qty: 8 },
      { resourceId: 'steel',  qty: 5 },
      { resourceId: 'silver', qty: 4 },
      { resourceId: 'topaz',  qty: 3 },
      { resourceId: 'coal',   qty: 15 },
    ],
  },
  resource_pack_gems: {
    name: 'Pack Gemmes',
    icon: 'hexagon',
    tagline: 'Pierres précieuses rares',
    items: [
      { resourceId: 'amethyst', qty: 5 },
      { resourceId: 'ruby',     qty: 3 },
      { resourceId: 'sapphire', qty: 3 },
      { resourceId: 'emerald',  qty: 2 },
      { resourceId: 'onyx',     qty: 3 },
    ],
  },
};

function getRevenueCatApiKey(): string | undefined {
  // Only require the key actually needed for the current environment.
  if (__DEV__ || Platform.OS === 'web' || Constants.executionEnvironment === 'storeClient') {
    return REVENUECAT_TEST_API_KEY;
  }
  if (Platform.OS === 'ios') return REVENUECAT_IOS_API_KEY;
  if (Platform.OS === 'android') return REVENUECAT_ANDROID_API_KEY;
  return REVENUECAT_TEST_API_KEY;
}

let rcInitialized = false;

export function initializeRevenueCat() {
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) throw new Error('RevenueCat Public API Key not found for this platform');
  Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
  rcInitialized = true;
}

export function isRevenueCatInitialized(): boolean {
  return rcInitialized;
}

function useSubscriptionContext() {
  const available = rcInitialized;

  const customerInfoQuery = useQuery({
    queryKey: ['revenuecat', 'customer-info'],
    queryFn: async () => Purchases.getCustomerInfo(),
    staleTime: 60 * 1000,
    enabled: available,
  });

  const offeringsQuery = useQuery({
    queryKey: ['revenuecat', 'offerings'],
    queryFn: async () => Purchases.getOfferings(),
    staleTime: 300 * 1000,
    enabled: available,
  });

  const purchaseMutation = useMutation({
    mutationFn: async (packageToPurchase: any) => {
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      return customerInfo;
    },
    onSuccess: () => customerInfoQuery.refetch(),
  });

  const restoreMutation = useMutation({
    mutationFn: async () => Purchases.restorePurchases(),
    onSuccess: () => customerInfoQuery.refetch(),
  });

  const isSubscribed =
    customerInfoQuery.data?.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;

  // Bridge premium status to GameContext (which sits below this provider).
  useEffect(() => {
    setPremiumActive(isSubscribed);
  }, [isSubscribed]);

  return {
    available,
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    isSubscribed,
    isLoading: available && (customerInfoQuery.isLoading || offeringsQuery.isLoading),
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
    refetchCustomerInfo: customerInfoQuery.refetch,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useSubscription must be used within a SubscriptionProvider');
  return ctx;
}
