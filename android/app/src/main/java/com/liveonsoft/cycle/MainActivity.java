package com.liveonsoft.cycle;

import android.os.Bundle;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Keep web content out of system bars (navigation/status).
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    }
}
