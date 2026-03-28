import { initializeApp } from "firebase/app";
import { getAnalytics, logEvent } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDnymi2F5BYeldQs0_gTS9Ltw-7MQ1Ojrg",
  authDomain: "indoor-cycling-5ff6a.firebaseapp.com",
  projectId: "indoor-cycling-5ff6a",
  appId: "1:544917538227:web:24f3ae49cd7feedf12f7c6",
  measurementId: "G-HQ2B3GQE0N"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export { analytics, logEvent };