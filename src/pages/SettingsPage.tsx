import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Workspace configuration</p>
      </div>

      <div className="glass-card p-6 space-y-5">
        <h3 className="font-medium text-foreground">Workspace</h3>
        <div className="space-y-3">
          <div>
            <Label className="text-muted-foreground text-sm">Workspace Name</Label>
            <Input defaultValue="My Store" className="mt-1 bg-muted border-border text-foreground" />
          </div>
          <div>
            <Label className="text-muted-foreground text-sm">Domain</Label>
            <Input defaultValue="mystore.com" className="mt-1 bg-muted border-border text-foreground" />
          </div>
          <div>
            <Label className="text-muted-foreground text-sm">API Key</Label>
            <Input defaultValue="ct_live_a1b2c3d4e5f6..." readOnly className="mt-1 bg-muted border-border text-foreground font-mono text-xs" />
          </div>
        </div>
      </div>

      <div className="glass-card p-6 space-y-4">
        <h3 className="font-medium text-foreground">SDK Installation</h3>
        <div className="bg-muted/50 rounded-lg p-4">
          <pre className="text-xs font-mono text-foreground overflow-x-auto">
{`<!-- CapiTrack AI SDK -->
<script>
  (function(c,a,p,i){
    c.capitrack=c.capitrack||function(){
      (c.capitrack.q=c.capitrack.q||[]).push(arguments)
    };
    var s=a.createElement('script');
    s.async=1;s.src=p;
    a.getElementsByTagName('head')[0].appendChild(s);
  })(window,document,'https://cdn.capitrack.ai/sdk.js');

  capitrack('init', 'CT-XXXXXX');
  capitrack('page');
</script>`}
          </pre>
        </div>
        <p className="text-xs text-muted-foreground">Add this snippet before the closing &lt;/head&gt; tag.</p>
      </div>

      <Button className="bg-primary text-primary-foreground hover:bg-primary/90">Save Changes</Button>
    </div>
  );
}
