type BrandMarkProps = {
  className?: string;
};

/** Decorative monogram: three flowing strands of hair. Colours come from `currentColor`. */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M15 7c9 5 9 11 1 17s-8 12 1 17"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.6"
      />
      <path
        d="M24 7c9 5 9 11 1 17s-8 12 1 17"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.6"
      />
      <path
        d="M33 7c9 5 9 11 1 17s-8 12 1 17"
        stroke="currentColor"
        strokeLinecap="round"
        strokeOpacity="0.55"
        strokeWidth="2.6"
      />
    </svg>
  );
}
