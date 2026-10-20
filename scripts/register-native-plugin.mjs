import fs from 'node:fs';
import path from 'node:path';
const root = 'android/app/src/main/java';
function walk(dir) { for (const entry of fs.readdirSync(dir, {withFileTypes:true})) { const p=path.join(dir,entry.name); if(entry.isDirectory()) walk(p); else if(entry.name==='MainActivity.java' || entry.name==='MainActivity.kt') patch(p); } }
function patch(file) {
  let s=fs.readFileSync(file,'utf8');
  if(s.includes('VideoDownloadPlugin')) return;
  if(file.endsWith('.java')) {
    const pkg=s.match(/^package\s+([\w.]+);/m)?.[1]; if(!pkg) throw new Error('Cannot find Java package in '+file);
    const importLine='import '+pkg+'.VideoDownloadPlugin;';
    s=s.replace(/(package\s+[\w.]+;)/, '$1\n\n'+importLine);
    s=s.replace(/(public\s+class\s+MainActivity\s+extends\s+BridgeActivity\s*\{)/, '$1\n    @Override\n    public void onCreate(android.os.Bundle savedInstanceState) {\n        registerPlugin(VideoDownloadPlugin.class);\n        super.onCreate(savedInstanceState);\n    }');
  } else {
    const pkg=s.match(/^package\s+([\w.]+)/m)?.[1]; if(!pkg) throw new Error('Cannot find Kotlin package in '+file);
    s=s.replace(/(package\s+[\w.]+)/, '$1\n\nimport '+pkg+'.VideoDownloadPlugin');
    s=s.replace(/(class\s+MainActivity\s*:\s*BridgeActivity\(\)\s*\{)/, '$1\n    override fun onCreate(savedInstanceState: android.os.Bundle?) {\n        registerPlugin(VideoDownloadPlugin::class.java)\n        super.onCreate(savedInstanceState)\n    }');
  }
  fs.writeFileSync(file,s);
  const plugin=`${pkg.replaceAll('.','/')}/VideoDownloadPlugin.${file.endsWith('.java')?'java':'kt'}`;
  const target=path.join(path.dirname(file), 'VideoDownloadPlugin.'+(file.endsWith('.java')?'java':'kt'));
  fs.writeFileSync(target, file.endsWith('.java') ? javaPlugin(pkg) : kotlinPlugin(pkg));
  console.log('Registered native download plugin in', file);
}
function javaPlugin(pkg) { return `package ${pkg};

import android.app.DownloadManager;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.webkit.URLUtil;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "VideoDownload")
public class VideoDownloadPlugin extends Plugin {
  @PluginMethod public void startDownload(PluginCall call) {
    String raw = call.getString("url");
    String requested = call.getString("fileName", "video.mp4");
    if (raw == null || !(raw.startsWith("https://") || raw.startsWith("http://"))) { call.reject("Enter a valid HTTP/HTTPS URL."); return; }
    try {
      String name = requested == null ? "video.mp4" : requested.replaceAll("[\\\\/:*?\\\"<>|]", "_");
      DownloadManager.Request req = new DownloadManager.Request(Uri.parse(raw));
      req.setTitle(name); req.setDescription("Downloading video");
      req.setAllowedOverMetered(true); req.setAllowedOverRoaming(false);
      req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
      req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
      String cookie = android.webkit.CookieManager.getInstance().getCookie(raw);
      if (cookie != null && !cookie.isEmpty()) req.addRequestHeader("Cookie", cookie);
      String ua = android.webkit.WebSettings.getDefaultUserAgent(getContext()); req.addRequestHeader("User-Agent", ua);
      DownloadManager dm = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
      long id = dm.enqueue(req); JSObject out = new JSObject(); out.put("downloadId", id); out.put("fileName", name); call.resolve(out);
    } catch (Exception e) { call.reject("Could not start download: " + e.getMessage()); }
  }
  @PluginMethod public void getProgress(PluginCall call) {
    long id = call.getLong("downloadId", -1L); if (id < 0) { call.reject("Invalid download ID"); return; }
    DownloadManager dm = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
    try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(id))) {
      JSObject out = new JSObject();
      if (c == null || !c.moveToFirst()) { out.put("status", "failed"); out.put("progress", 0); call.resolve(out); return; }
      int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
      long total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
      long sofar = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
      int progress = total > 0 ? (int)Math.min(100, (sofar * 100L) / total) : 0;
      String state = status == DownloadManager.STATUS_SUCCESSFUL ? "complete" : status == DownloadManager.STATUS_FAILED ? "failed" : status == DownloadManager.STATUS_PAUSED ? "paused" : "downloading";
      out.put("status", state); out.put("progress", progress); out.put("bytesDownloaded", sofar); out.put("totalBytes", total);
      if (status == DownloadManager.STATUS_FAILED) out.put("reason", c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON)));
      call.resolve(out);
    } catch (Exception e) { call.reject("Could not read download progress: " + e.getMessage()); }
  }
}
`; }
function kotlinPlugin(pkg) { return `package ${pkg}

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.database.Cursor
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "VideoDownload")
class VideoDownloadPlugin : Plugin() {
  @PluginMethod fun startDownload(call: PluginCall) {
    val raw = call.getString("url")
    val requested = call.getString("fileName") ?: "video.mp4"
    if (raw == null || !(raw.startsWith("https://") || raw.startsWith("http://"))) { call.reject("Enter a valid HTTP/HTTPS URL."); return }
    try {
      val name = requested.replace(Regex("[\\\\/:*?\\\"<>|]"), "_")
      val req = DownloadManager.Request(Uri.parse(raw)).setTitle(name).setDescription("Downloading video")
      req.setAllowedOverMetered(true); req.setAllowedOverRoaming(false)
      req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
      req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
      val cookie = android.webkit.CookieManager.getInstance().getCookie(raw)
      if (!cookie.isNullOrEmpty()) req.addRequestHeader("Cookie", cookie)
      req.addRequestHeader("User-Agent", android.webkit.WebSettings.getDefaultUserAgent(context))
      val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
      val out = JSObject(); out.put("downloadId", dm.enqueue(req)); out.put("fileName", name); call.resolve(out)
    } catch (e: Exception) { call.reject("Could not start download: "+e.message) }
  }
  @PluginMethod fun getProgress(call: PluginCall) {
    val id = call.getLong("downloadId", -1L) ?: -1L
    if (id < 0) { call.reject("Invalid download ID"); return }
    val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    try {
      val c: Cursor? = dm.query(DownloadManager.Query().setFilterById(id))
      c.use { cur ->
        val out = JSObject()
        if (cur == null || !cur.moveToFirst()) { out.put("status", "failed"); out.put("progress", 0); call.resolve(out); return }
        val status = cur.getInt(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
        val total = cur.getLong(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
        val sofar = cur.getLong(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
        val progress = if (total > 0) ((sofar * 100L) / total).toInt().coerceAtMost(100) else 0
        val state = when(status) { DownloadManager.STATUS_SUCCESSFUL -> "complete"; DownloadManager.STATUS_FAILED -> "failed"; DownloadManager.STATUS_PAUSED -> "paused"; else -> "downloading" }
        out.put("status", state); out.put("progress", progress); out.put("bytesDownloaded", sofar); out.put("totalBytes", total)
        if (status == DownloadManager.STATUS_FAILED) out.put("reason", cur.getInt(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON)))
        call.resolve(out)
      }
    } catch (e: Exception) { call.reject("Could not read download progress: "+e.message) }
  }
}
`; }
if (!fs.existsSync(root)) throw new Error('Android project not found; run npx cap add android first.');
walk(root);
