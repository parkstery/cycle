package com.liveonsoft.cycle;

import android.os.Bundle;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Keep web content out of system bars (navigation/status).
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        // Keep keyboard from resizing WebView so banner stays anchored at screen bottom.
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN);
    }
}
