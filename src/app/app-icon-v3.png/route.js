import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(request) {
  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("s") || 512);
  const size = [180, 192, 512].includes(requested) ? requested : 512;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          background: "linear-gradient(135deg,#06070b 0%,#111827 58%,#250916 100%)",
          color: "white",
          fontFamily: "Arial, sans-serif",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", inset: 10, border: "10px solid #ed168c", borderRadius: 92, boxShadow: "0 0 28px #ed168c" }} />
        <div style={{ position: "absolute", width: 230, height: 34, left: -35, top: 85, background: "#d10073", transform: "rotate(-45deg)" }} />
        <div style={{ position: "absolute", width: 250, height: 34, right: -55, bottom: 95, background: "#d10073", transform: "rotate(-45deg)" }} />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "88%", marginTop: -6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: 238, fontSize: 218, lineHeight: 1, fontWeight: 900, letterSpacing: -22 }}>
            <span style={{ display: "flex" }}>TNDC</span>
          </div>
          <div style={{ display: "flex", width: "100%", height: 7, background: "#ed168c", borderRadius: 5, marginTop: -6 }} />
          <div style={{ display: "flex", fontSize: 42, lineHeight: 1.1, fontWeight: 700, letterSpacing: 7, marginTop: 18 }}>THANEE DECOR</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", marginTop: 20, paddingTop: 15, borderTop: "6px solid #ed168c", borderBottom: "6px solid #ed168c" }}>
            <span style={{ color: "#ff2b91", fontSize: 51, fontWeight: 900, fontStyle: "italic", marginRight: 10 }}>SIGN</span>
            <span style={{ color: "#fff", fontSize: 51, fontWeight: 900, fontStyle: "italic" }}>BUSINESS</span>
          </div>
        </div>
      </div>
    ),
    { width: size, height: size }
  );
}
