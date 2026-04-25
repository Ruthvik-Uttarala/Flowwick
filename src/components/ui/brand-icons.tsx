import * as React from "react";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Monochrome Shopify-style shopping bag mark.
 *
 * Per the design brief we ship a clean local SVG that resembles a shopping bag
 * rather than reusing the lucide ShoppingBag icon — keeps the Settings cards
 * looking branded without requiring Shopify's official logo.
 */
export function ShopifyMark({ size = 20, className, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <path d="M5 7h14l-1.2 12.2A1.8 1.8 0 0 1 16 21H8a1.8 1.8 0 0 1-1.8-1.8L5 7Z" />
      <path d="M9 10V6a3 3 0 1 1 6 0v4" />
    </svg>
  );
}

/**
 * Monochrome Instagram-style camera mark.
 *
 * Square frame, lens circle, and accent dot — recognizable as an Instagram-like
 * camera silhouette without using Meta's branded gradient.
 */
export function InstagramMark({ size = 20, className, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
