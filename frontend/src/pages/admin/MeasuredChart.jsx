import { useLayoutEffect, useRef, useState } from "react";
import { ResponsiveContainer } from "recharts";

// Charts mount only after the layout is measured, including drawer/viewport changes.
export const MeasuredChart = ({ children }) => {
  const frame = useRef(null);
  const [size, setSize] = useState(null);
  useLayoutEffect(() => {
    const measure = () => {
      const box = frame.current?.getBoundingClientRect();
      if (box) setSize({ width: Math.floor(box.width), height: Math.floor(box.height) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={frame} style={{ width: "100%", height: "100%", minWidth: 0 }}>{size?.width > 0 && size?.height > 0 && <ResponsiveContainer width="100%" height="100%" initialDimension={size} minWidth={0}>{children}</ResponsiveContainer>}</div>;
};