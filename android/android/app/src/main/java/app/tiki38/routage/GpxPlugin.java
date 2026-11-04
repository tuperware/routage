package app.tiki38.routage;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

// « Ouvrir avec » : écrit le GPX dans le cache et propose Navionics, TZ iBoat, etc.
@CapacitorPlugin(name = "GpxOpen")
public class GpxPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String name = call.getString("name", "route.gpx");
        String data = call.getString("data", "");
        String mode = call.getString("mode", "view");
        try {
            File dir = new File(getContext().getCacheDir(), "gpx");
            dir.mkdirs();
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) f.delete();
            File f = new File(dir, name.replaceAll("[^A-Za-z0-9._-]", "_"));
            try (FileOutputStream o = new FileOutputStream(f)) { o.write(data.getBytes(StandardCharsets.UTF_8)); }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent i;
            if ("send".equals(mode)) {
                i = new Intent(Intent.ACTION_SEND);
                i.setType("application/gpx+xml");
                i.putExtra(Intent.EXTRA_STREAM, uri);
            } else {
                i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/gpx+xml");
            }
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent c = Intent.createChooser(i, "send".equals(mode) ? "Envoyer la route" : "Ouvrir la route avec");
            c.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(c);
            JSObject r = new JSObject(); r.put("ok", true); call.resolve(r);
        } catch (Exception e) {
            call.reject("Ouverture impossible : " + e.getMessage());
        }
    }
}
