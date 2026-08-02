/**
 * GoldGrantReconciler — idempotent fulfillment of consumable IAPs.
 *
 * Reconciles RevenueCat's nonSubscriptionTransactions against a persisted set
 * of already-granted transaction IDs, granting gold OR resources exactly once
 * per unique transaction — even if the app was closed mid-purchase.
 */
import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSubscription, GOLD_PRODUCTS, RESOURCE_PRODUCTS } from '@/lib/revenuecat';
import { useGame } from '@/context/GameContext';

const GRANTED_TX_KEY = '@fk_granted_gold_tx_v1';

function baseProductId(identifier: string): string {
  return identifier.split(':')[0];
}

export default function GoldGrantReconciler() {
  const { customerInfo, available } = useSubscription();
  const game = useGame();
  const busyRef = useRef(false);

  useEffect(() => {
    if (!available || !customerInfo || busyRef.current) return;
    const transactions = customerInfo.nonSubscriptionTransactions ?? [];
    if (transactions.length === 0) return;

    busyRef.current = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(GRANTED_TX_KEY);
        const granted = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
        let changed = false;

        for (const tx of transactions) {
          const txId = tx.transactionIdentifier;
          if (!txId || granted.has(txId)) continue;

          const productId = baseProductId(tx.productIdentifier);
          const gold = GOLD_PRODUCTS[productId];
          const resourcePack = RESOURCE_PRODUCTS[productId];

          if (!gold && !resourcePack) continue;

          // Persist the grant marker BEFORE granting so a crash between the
          // two never double-grants (losing one grant is recoverable via
          // support; double-granting silently corrupts the economy).
          granted.add(txId);
          await AsyncStorage.setItem(GRANTED_TX_KEY, JSON.stringify([...granted]));

          if (gold) {
            game.addGold(gold);
          } else if (resourcePack) {
            for (const { resourceId, qty } of resourcePack.items) {
              game.addResource(resourceId, qty);
            }
          }
          changed = true;
        }
        if (!changed && raw === null && granted.size > 0) {
          await AsyncStorage.setItem(GRANTED_TX_KEY, JSON.stringify([...granted]));
        }
      } catch (e) {
        console.warn('Consumable grant reconciliation failed:', e);
      } finally {
        busyRef.current = false;
      }
    })();
  }, [available, customerInfo, game]);

  return null;
}
