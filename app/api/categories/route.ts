import { NextResponse } from "next/server";
import { listCategories } from "@/lib/restaurantRepository";

export async function GET() {
  try {
    const categories = await listCategories();
    return NextResponse.json({ categories }, { status: 200 });
  } catch (err) {
    console.error("Categories error:", err);
    return NextResponse.json({ error: "Something went wrong loading categories" }, { status: 500 });
  }
}