import {describe,expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {OperationsHeader,PRIMARY_OPERATIONS_AREAS} from "../app/components/operations-header";

describe("reworked primary financial navigation",()=>{
  it("keeps one clear active destination and accessible section labels",()=>{
    const html=renderToStaticMarkup(<OperationsHeader active="dashboard"
      title="Payment operations" description="Evidence first"
      context="OVERVIEW" email="admin@example.test"/>);
    expect(html).toContain('aria-label="Primary navigation"');
    expect(html).toContain('aria-label="Control and evidence navigation"');
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain("Payment operations");
    expect(html).toContain("admin@example.test");
    expect(html).toContain('aria-current="page"');
    expect((html.match(/aria-current="page"/g)||[])).toHaveLength(1);
    for(const area of PRIMARY_OPERATIONS_AREAS)
      expect(html).toContain('href="'+area.href+'"');
    expect(html).not.toContain("Download Northstar invoice");
    expect(html).not.toContain("Upload the first invoice");
  });
  it("marks the correct route active for every main destination",()=>{
    for(const area of PRIMARY_OPERATIONS_AREAS) {
      const html=renderToStaticMarkup(<OperationsHeader active={area.key}
        title={area.label} description="Read-only" email="admin@example.test"/>);
      const current=html.match(/<a[^>]*aria-current="page"[^>]*>/g)||[];
      expect(current).toHaveLength(1);
      expect(current[0]).toContain('href="'+area.href+'"');
    }
  });
});
