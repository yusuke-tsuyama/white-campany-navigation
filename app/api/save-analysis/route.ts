import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const { data, error } = await supabase
      .from("analyses")
      .insert({
        user_id: authData.user.id,
        company_name: body.companyName ?? null,
        screenshot_extracted: body.extracted,
        image_score: body.scoreResult,
        ir_summary: body.irSummary ?? null,
        final_judge: body.finalJudge ?? null,
      })
      .select("id, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ saved: true, analysis: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "server error" },
      { status: 500 }
    );
  }
}
