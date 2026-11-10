package com.srcvip.app;

import android.content.Context;
import android.media.AudioManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SystemVolume")
public class SystemVolumePlugin extends Plugin {

  private AudioManager audioManager() {
    return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
  }

  private JSObject volumeState(AudioManager am) {
    int current = am.getStreamVolume(AudioManager.STREAM_MUSIC);
    int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
    double percent = max > 0 ? ((double) current) / ((double) max) : 0;

    JSObject result = new JSObject();
    result.put("current", current);
    result.put("max", max);
    result.put("percent", percent);
    return result;
  }

  @PluginMethod
  public void getMediaVolume(PluginCall call) {
    AudioManager am = audioManager();
    if (am == null) {
      call.reject("AudioManager unavailable");
      return;
    }
    call.resolve(volumeState(am));
  }

  @PluginMethod
  public void setMediaVolume(PluginCall call) {
    AudioManager am = audioManager();
    if (am == null) {
      call.reject("AudioManager unavailable");
      return;
    }

    Double percent = call.getDouble("percent");
    if (percent == null) {
      call.reject("percent is required");
      return;
    }

    double clamped = Math.max(0, Math.min(1, percent));
    int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
    int target = (int) Math.round(clamped * max);
    am.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0);
    call.resolve(volumeState(am));
  }
}
