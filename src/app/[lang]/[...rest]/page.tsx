import { notFound } from "next/navigation";

/** Any address that matches no page renders the translated 404 from ../not-found.tsx. */
export default function CatchAll() {
  notFound();
}
