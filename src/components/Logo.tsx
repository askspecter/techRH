import Image from "next/image";

/**
 * CREO brand mark - the white "C" on the sunset gradient. The source art is a
 * full-bleed square with its own gradient background, so we render it edge to
 * edge inside a rounded badge (no white plate, no padding) and let the artwork
 * carry the color.
 */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden rounded-xl ${className}`}
    >
      <Image
        src="/creo-logo.jpg"
        alt="CREO"
        width={96}
        height={96}
        className="h-full w-full object-cover"
        priority
      />
    </span>
  );
}
