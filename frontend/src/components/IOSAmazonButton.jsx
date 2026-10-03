import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { openIOSExternal } from "@/lib/iosCommerce";
import { paymentError } from "@/lib/commercePolicy";

export default function IOSAmazonButton({ productId }) {
  const [url, setURL] = useState("");
  useEffect(() => {
    let active = true;
    api.get(`/ios-commerce/amazon/${encodeURIComponent(productId)}`).then(({data}) => { if (active) setURL(data.url); }).catch(() => {});
    return () => { active = false; };
  }, [productId]);
  if (!url) return <p className="text-xs text-[#6B7269]">The printed-book purchase link is not currently available.</p>;
  return <div className="space-y-2"><button className="pill pill-primary w-full" onClick={() => openIOSExternal(url).catch(e => toast.error(paymentError(e)))}>Buy printed book on Amazon</button><p className="text-xs text-[#6B7269]">Opens Amazon for a physical book. Your Amazon order is fulfilled by Amazon and does not unlock a digital course.</p></div>;
}
