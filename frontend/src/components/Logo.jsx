/** Tony Yoga logo — round emblem "Since 1986 · Tony Yoga". */
export default function Logo({ size, className = "" }) {
  const style = size ? { width: size, height: size } : undefined;
  return (
    <img
      src="/brand/logo.png"
      alt="Tony Yoga"
      style={style}
      className={`rounded-full object-cover shrink-0 ${className}`}
      loading="eager"
      decoding="async"
    />
  );
}
