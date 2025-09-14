package com.logvida.app;

import com.getcapacitor.BridgeActivity;
import com.transistorsoft.capacitor.background.geolocation.CapacitorBackgroundGeolocation;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    registerPlugin(CapacitorBackgroundGeolocation.class);
  }
}
