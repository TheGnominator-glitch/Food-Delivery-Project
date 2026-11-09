// FR20, FR21: where to send the user after buying credits. Only paths inside Foodie are accepted,
// so a crafted link cannot send anyone to another site. Without one, the origin is Home for now
// (the flow's origins, Checkout and Account, do not exist yet).
export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/home";
  return value;
}
