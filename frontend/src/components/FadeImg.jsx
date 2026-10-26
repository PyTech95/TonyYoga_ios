import { useEffect, useRef, useState } from "react";

// A picture that comes from Admin (the backend). Renders nothing when no picture is set,
// and fades in once loaded, so the page never flashes a different image first.
export default function FadeImg({ src, className = "", ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    if (ref.current?.complete && ref.current.naturalWidth > 0) setShown(true);
  }, [src]);
  if (!src) return null;
  return (
    <img
      ref={ref}
      src={src}
      onLoad={() => setShown(true)}
      className={`${className} transition-opacity duration-500 ${shown ? "opacity-100" : "opacity-0"}`}
      {...rest}
    />
  );
}
