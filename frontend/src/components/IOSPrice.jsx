import { useEffect, useState } from "react";
import { isIOSApp } from "@/lib/iosPlatform";
import { getIOSOffer, getAppleProduct } from "@/lib/iosCommerce";

export default function IOSPrice({ itemType, itemId, fallback = null }) {
  const [label, setLabel] = useState("App Store price at checkout");
  useEffect(() => {
    if (!isIOSApp()) return;
    let active = true;
    getIOSOffer(itemType, itemId).then(async offer => {
      if (offer.route !== "iap") { if (active) setLabel(offer.route === "external" ? null : "Not available in this app"); return; }
      const product = await getAppleProduct(offer.product_id);
      if (active) setLabel(`${product.displayPrice}${product.periodLabel ? ` / ${product.periodLabel.replace(/^every /, "")}` : ""}`);
    }).catch(() => { if (active) setLabel("App Store price at checkout"); });
    return () => { active = false; };
  }, [itemType, itemId]);
  return isIOSApp() ? <span>{label ?? fallback}</span> : fallback;
}
