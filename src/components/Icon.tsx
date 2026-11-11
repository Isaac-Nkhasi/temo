import type { ReactNode } from "react";

export function Icon({
  name,
  size = 22,
  filled = false,
}: {
  name: string;
  size?: number;
  filled?: boolean;
}) {
  const paths: Record<string, ReactNode> = {
    home: (
      <>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5.5 9.5V21h13V9.5M9 21v-7h6v7" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    store: (
      <>
        <path d="M3 9h18l-2-5H5L3 9Z" />
        <path d="M5 9v11h14V9M9 20v-6h6v6" />
        <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
      </>
    ),
    leaf: (
      <>
        <path d="M20.8 3.2C12 3.5 5.5 6.8 4.2 12.4c-1 4.3 2.3 7.3 6.4 6.1 5.6-1.6 8.8-7.7 10.2-15.3Z" />
        <path d="M4 21c2.5-5.2 6.4-8.8 12-11" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    cloud: (
      <>
        <path d="M17.5 19H6a4 4 0 0 1-.5-8 6.5 6.5 0 0 1 12.6 1.5A3.3 3.3 0 0 1 17.5 19Z" />
        <path d="M9 22v-2m6 2v-2" />
      </>
    ),
    arrow: <path d="m9 18 6-6-6-6" />,
    back: <path d="m15 18-6-6 6-6" />,
    heart: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
    ),
    comment: (
      <>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m6 9 6 6 6-6" />,
    message: (
      <>
        <path d="M20 15a4 4 0 0 1-4 4H7l-4 2V7a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4Z" />
        <path d="M8 10h8M8 14h5" />
      </>
    ),
    sprout: (
      <>
        <path d="M12 22V10" />
        <path d="M12 13C7 13 4 10 4 5c5 0 8 3 8 8ZM12 17c0-5 3-8 8-8 0 5-3 8-8 8Z" />
      </>
    ),
    cart: (
      <>
        <path d="M3 3h2l2.4 11.5h10.8L21 7H6" />
        <circle cx="9" cy="20" r="1" />
        <circle cx="18" cy="20" r="1" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
