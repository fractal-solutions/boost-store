import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { searchPlaces, type Place } from "@/lib/mapConfig";
import { cn } from "@/lib/utils";

export function AddressSearch({
  onSelect,
  placeholder = "Search for a street, area or landmark",
  autoFocus,
  className,
}: {
  onSelect: (place: Place) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const places = await searchPlaces(query);
      setResults(places);
      setOpen(true);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer.current);
  }, [query]);

  const choose = (place: Place) => {
    onSelect(place);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-amber-600/40">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm outline-none"
        />
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {open && (
        <ul className="absolute z-[1200] mt-1 max-h-72 w-full overflow-auto rounded-xl border bg-background py-1 shadow-xl">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">No matches found.</li>
          ) : (
            results.map((place, index) => (
              <li key={`${place.latitude}-${place.longitude}-${index}`}>
                <button onClick={() => choose(place)} className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-muted">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <span>
                    <span className="block text-sm font-medium">{place.name}</span>
                    <span className="block text-xs text-muted-foreground">{place.label}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
