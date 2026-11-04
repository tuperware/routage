package app.tiki38.routage;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Icône du logiciel sur l'écran du téléphone : Tiki 38, catamaran ou monocoque.
// Le choix est noté tout de suite et appliqué quand l'appli passe en arrière-plan,
// pour que la nouvelle icône soit là au prochain démarrage.
@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {
    static final String PREF = "routage_icon";
    static final String[] KINDS = { "t", "c", "m" };
    static final String[] ALIASES = { ".IconTiki", ".IconCat", ".IconMono" };

    @PluginMethod
    public void set(PluginCall call) {
        String k = call.getString("kind", "t");
        if (!"c".equals(k) && !"m".equals(k)) k = "t";
        getContext().getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putString("want", k).apply();
        JSObject r = new JSObject(); r.put("ok", true); call.resolve(r);
    }

    static void apply(Context ctx) {
        String want = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString("want", null);
        if (want == null) return;
        PackageManager pm = ctx.getPackageManager();
        String pkg = ctx.getPackageName();
        int idx = 0;
        for (int i = 0; i < KINDS.length; i++) if (KINDS[i].equals(want)) idx = i;
        ComponentName on = new ComponentName(pkg, pkg + ALIASES[idx]);
        int st = pm.getComponentEnabledSetting(on);
        boolean isOn = st == PackageManager.COMPONENT_ENABLED_STATE_ENABLED || (st == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && idx == 0);
        if (isOn) return;
        pm.setComponentEnabledSetting(on, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
        for (int i = 0; i < ALIASES.length; i++) {
            if (i == idx) continue;
            pm.setComponentEnabledSetting(new ComponentName(pkg, pkg + ALIASES[i]), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
        }
    }
}
