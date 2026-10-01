import { useState } from "react";
import { placeholderImage } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Image with a shimmer skeleton until the placeholder has loaded. */
export function ProductImage({ seed, alt, className }: { seed: string; alt?: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      {!loaded && <span className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted to-muted-foreground/10" />}
      <img
        src={placeholderImage(seed)}
        alt={alt ?? ""}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={cn("h-full w-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
      />
    </div>
  );
}
