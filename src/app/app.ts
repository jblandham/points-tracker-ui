// --- INTERFACES ---
interface PointChange {
  amount: number;
  timestamp: number; // Unix timestamp in milliseconds
}

interface NotificationConfig {
  phone: string;
  carrier: string;
}

interface AppState {
  scores: { [key: string]: number };
  currentPin: string;
  adminPassHash: string;
  notifications: NotificationConfig[];
  changeHistory: { [key: string]: PointChange[] };
  pinThreshold: number;
}

// =========================================================
// !!! CRITICAL CONFIGURATION SWITCH !!!
// The application will now use your local Python Flask API.
const BACKEND_TYPE: 'FIREBASE' | 'MONGO_DB' = 'MONGO_DB'; 
// =========================================================

// --- CONFIGURATION CONSTANTS ---
// RENDER DEPLOYMENT URL
const BASE_API_URL = 'https://points-tracker-backend.onrender.com'; 

// For MONGO_DB backend
const API_STATE_ENDPOINT = `${BASE_API_URL}/api/state`; 
const API_NOTIFY_ENDPOINT = `${BASE_API_URL}/api/state/send-alert`; 

// Shared Defaults
const DEFAULT_ADMIN_PASSWORD_HASH = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3'; // SHA-256 hash for "123"
const DEFAULT_PIN = '1234';
const DEFAULT_THRESHOLD = 10;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

// SMS Carrier Gateways (Domain only)
const CARRIER_GATEWAYS: { [key: string]: string } = {
  'Verizon': 'vtext.com',
  'AT&T': 'txt.att.net',
  'T-Mobile': 'tmomail.net',
  'Sprint': 'messaging.sprintpcs.com',
  'Boost Mobile': 'sms.alltel.net',
  'MetroPCS': 'mymetropcs.com',
  'Cricket': 'mms.aiowireless.net',
  'US Cellular': 'email.uscc.net',
};


import { ChangeDetectionStrategy, Component, signal, effect, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HttpClient, HttpHeaders } from '@angular/common/http';
import { lastValueFrom } from 'rxjs'; 

// Firebase imports (retained for potential dual-backend logic)
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, Firestore } from 'firebase/firestore';


// Local declarations for environment variables (retained for Firebase path compatibility)
declare const __app_id: string | undefined;
declare const __firebase_config: string | undefined;
declare const __initial_auth_token: string | undefined;


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, HttpClientModule],
  template: `
    <div class="min-h-screen flex flex-col font-inter">
      <!-- Header and Tabs -->
      <div class="flex-shrink-0 shadow-lg bg-gray-900 text-white">
        <div class="max-w-4xl mx-auto px-4 py-3 sm:px-6 lg:px-8">
          <h1 class="text-3xl font-extrabold tracking-tight">Family Points Tracker ({{ BACKEND_TYPE }})</h1>
          <div class="mt-4 flex space-x-2 border-b border-gray-700">
            <button
              (click)="setActiveTab('Lila')"
              [class]="getTabClass('Lila', 'bg-purple-600 hover:bg-purple-700')"
            >
              Lila
            </button>
            <button
              (click)="setActiveTab('Maryn')"
              [class]="getTabClass('Maryn', 'bg-lime-600 hover:bg-lime-700')"
            >
              Maryn
            </button>
            <button
              (click)="setActiveTab('Admin')"
              [class]="getTabClass('Admin', 'bg-gray-700 hover:bg-gray-800')"
            >
              Admin
            </button>
          </div>
        </div>
      </div>

      <!-- Main Content Area -->
      <div class="flex-grow max-w-4xl mx-auto w-full p-4 sm:p-6 lg:p-8 overflow-y-auto">

        <!-- Lila Tab Content -->
        @if (activeTab() === 'Lila') {
          <div class="p-6 rounded-2xl shadow-xl border-4 border-purple-400 text-gray-900"
               style="background-color: #e6e6fa;"> <!-- Lilac color -->
            <h2 class="text-4xl font-bold mb-4 text-purple-900">Lila's Points</h2>
            <div class="text-8xl font-black mb-6 text-center text-purple-700">{{ scores()['Lila'] }}</div>
            <div [class]="commonControlsClass()">
              <div class="text-lg font-semibold mb-3 text-purple-800">Change Amount: {{ selectedValue() }}</div>
              <div class="flex justify-center space-x-4 mb-6">
                <button (click)="changePoints('Lila', 'decrement')"
                        class="text-6xl font-extrabold w-24 h-24 bg-red-600 text-white rounded-full shadow-lg transition duration-150 transform hover:scale-105 active:shadow-inner active:bg-red-700">
                  -
                </button>
                <button (click)="changePoints('Lila', 'increment')"
                        class="text-6xl font-extrabold w-24 h-24 bg-green-600 text-white rounded-full shadow-lg transition duration-150 transform hover:scale-105 active:shadow-inner active:bg-green-700">
                  +
                </button>
              </div>
              @if (changeMessage()) {
                <p class="text-center mt-4 text-sm font-medium text-red-600">{{ changeMessage() }}</p>
              }
              <!-- Point Selector -->
              <div class="mt-8">
                <h3 class="text-xl font-bold mb-4 text-center text-gray-900 dark:text-white">Select Point Value</h3>
                <div class="radio-container">
                  @for (p of points; track p) {
                    <label class="block" (click)="selectPointValue(p)">
                      <input type="radio" name="point-value" [value]="p"
                             [checked]="selectedValue() === p"
                             class="hidden"
                      >
                      <div class="py-3 px-1 text-center font-bold rounded-lg cursor-pointer transition duration-150 border-2
                                  " [class]="selectedValue() === p ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200'">
                        {{ p }}
                      </div>
                    </label>
                  }
                </div>

                <div class="mt-6">
                  <label for="custom-value-lila" class="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Or Enter Custom Value
                  </label>
                  <input
                    type="number"
                    id="custom-value-lila"
                    min="1"
                    [ngModel]="customValueInput()"
                    (ngModelChange)="handleCustomValueChange($event)"
                    class="w-full px-4 py-3 text-center text-gray-900 bg-white border border-gray-300 rounded-lg text-lg focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="e.g., 42"
                  >
                </div>
              </div>
            </div>
          </div>
        }

        <!-- Maryn Tab Content -->
        @if (activeTab() === 'Maryn') {
          <div class="p-6 rounded-2xl shadow-xl border-4 border-lime-400 text-gray-900"
               style="background-color: #ccffcc;"> <!-- Bright Green color -->
            <h2 class="text-4xl font-bold mb-4 text-lime-900">Maryn's Points</h2>
            <div class="text-8xl font-black mb-6 text-center text-lime-700">{{ scores()['Maryn'] }}</div>
            <div [class]="commonControlsClass()">
              <div class="text-lg font-semibold mb-3 text-lime-800">Change Amount: {{ selectedValue() }}</div>
              <div class="flex justify-center space-x-4 mb-6">
                <button (click)="changePoints('Maryn', 'decrement')"
                        class="text-6xl font-extrabold w-24 h-24 bg-red-600 text-white rounded-full shadow-lg transition duration-150 transform hover:scale-105 active:shadow-inner active:bg-red-700">
                  -
                </button>
                <button (click)="changePoints('Maryn', 'increment')"
                        class="text-6xl font-extrabold w-24 h-24 bg-green-600 text-white rounded-full shadow-lg transition duration-150 transform hover:scale-105 active:shadow-inner active:bg-green-700">
                  +
                </button>
              </div>
              @if (changeMessage()) {
                <p class="text-center mt-4 text-sm font-medium text-red-600">{{ changeMessage() }}</p>
              }
              <!-- Point Selector -->
              <div class="mt-8">
                <h3 class="text-xl font-bold mb-4 text-center text-gray-900 dark:text-white">Select Point Value</h3>
                <div class="radio-container">
                  @for (p of points; track p) {
                    <label class="block" (click)="selectPointValue(p)">
                      <input type="radio" name="point-value" [value]="p"
                             [checked]="selectedValue() === p"
                             class="hidden"
                      >
                      <div class="py-3 px-1 text-center font-bold rounded-lg cursor-pointer transition duration-150 border-2
                                  " [class]="selectedValue() === p ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200'">
                        {{ p }}
                      </div>
                    </label>
                  }
                </div>

                <div class="mt-6">
                  <label for="custom-value-maryn" class="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Or Enter Custom Value
                  </label>
                  <input
                    type="number"
                    id="custom-value-maryn"
                    min="1"
                    [ngModel]="customValueInput()"
                    (ngModelChange)="handleCustomValueChange($event)"
                    class="w-full px-4 py-3 text-center text-gray-900 bg-white border border-gray-300 rounded-lg text-lg focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="e.g., 42"
                  >
                </div>
              </div>
            </div>
          </div>
        }

        <!-- Admin Tab Content -->
        @if (activeTab() === 'Admin') {
          <div class="bg-gray-800 text-white p-8 rounded-2xl shadow-2xl border-2 border-gray-600">
            <h2 class="text-4xl font-bold mb-6 text-yellow-400">Admin Panel</h2>

            <!-- Admin Login -->
            @if (!isAdminLoggedIn()) {
              <div class="space-y-4">
                <label for="admin-pass" class="block text-sm font-medium text-gray-300">Admin Password (Plain Text)</label>
                <input
                  type="password"
                  id="admin-pass"
                  [(ngModel)]="adminLoginPass"
                  (keyup.enter)="handleAdminLogin()"
                  class="w-full px-4 py-2 text-gray-900 bg-gray-200 border border-gray-700 rounded-lg focus:ring-yellow-500 focus:border-yellow-500"
                  placeholder="Enter plain text password"
                >
                <button (click)="handleAdminLogin()"
                        class="w-full py-3 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-semibold transition duration-150">
                  Log In
                </button>
                @if (adminLoginError()) {
                  <p class="text-red-400 text-sm mt-2">{{ adminLoginError() }}</p>
                }
              </div>
            }

            <!-- Admin Settings -->
            @if (isAdminLoggedIn()) {
              <div class="space-y-8">
                
                <!-- Security Settings -->
                <div>
                  <h3 class="text-2xl font-semibold mb-4 text-gray-200">Security Settings</h3>
                  
                  <!-- Change PIN -->
                  <div class="mb-6">
                    <label for="new-pin" class="block text-sm font-medium text-gray-300">New 4-digit PIN</label>
                    <input
                      type="password"
                      id="new-pin"
                      [value]="adminPinInput"
                      (input)="adminPinInput = $event.target.value"
                      maxlength="4"
                      class="w-full px-4 py-2 text-gray-900 bg-gray-200 border border-gray-700 rounded-lg focus:ring-yellow-500 focus:border-yellow-500"
                    >
                    <button (click)="handlePinUpdate()"
                            class="mt-3 py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition duration-150">
                      Update PIN
                    </button>
                  </div>

                  <!-- Change Admin Password -->
                  <div class="mb-6">
                    <label for="new-admin-pass" class="block text-sm font-medium text-gray-300">New Admin Password (Plain Text)</label>
                    <input
                      type="password"
                      id="new-admin-pass"
                      [(ngModel)]="newAdminPassInput"
                      class="w-full px-4 py-2 text-gray-900 bg-gray-200 border border-gray-700 rounded-lg focus:ring-yellow-500 focus:border-yellow-500"
                      placeholder="Enter new plain text password"
                    >
                    <button (click)="handleAdminPasswordUpdate()"
                            class="mt-3 py-2 px-4 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition duration-150">
                      Update Admin Password
                    </button>
                  </div>

                  <!-- Threshold Setting -->
                  <div>
                    <label for="pin-threshold" class="block text-sm font-medium text-gray-300">
                      Cumulative Point Change Threshold (Currently: {{ adminState().pinThreshold }} pts)
                    </label>
                    <input
                      type="number"
                      id="pin-threshold"
                      [ngModel]="adminThresholdInput"
                      (ngModelChange)="adminThresholdInput = $event"
                      min="1"
                      class="w-full px-4 py-2 text-gray-900 bg-gray-200 border border-gray-700 rounded-lg focus:ring-yellow-500 focus:border-yellow-500"
                    >
                    <p class="text-sm text-gray-400 mt-1">If the total point change in 5 minutes exceeds this value, the PIN is required.</p>
                    <button (click)="handleThresholdUpdate()"
                            class="mt-3 py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition duration-150">
                      Update Threshold
                    </button>
                  </div>
                  
                  @if (adminMessage()) {
                    <p class="text-green-400 text-sm mt-4">{{ adminMessage() }}</p>
                  }
                </div>

                <!-- Notification Settings (Email-to-Text) -->
                <div>
                  <h3 class="text-2xl font-semibold mb-4 text-gray-200">Email-to-Text Notifications (5 Recipients)</h3>
                  
                  @for (i of [0, 1, 2, 3, 4]; track i) {
                    <div class="mb-5 p-4 border border-gray-700 rounded-lg">
                      <h4 class="text-md font-semibold text-gray-300 mb-2">Recipient #{{ i + 1 }}</h4>
                      
                      <!-- Phone Input -->
                      <div class="mb-3">
                        <label [for]="'phone-' + i" class="block text-sm font-medium text-gray-400">Phone # (10 digits: 5551234567)</label>
                        <input
                          [id]="'phone-' + i"
                          type="tel"
                          [ngModel]="adminState().notifications[i]?.phone || ''"
                          (ngModelChange)="updateNotification(i, 'phone', $event)"
                          maxlength="10"
                          class="w-full px-4 py-2 text-gray-900 bg-gray-200 border border-gray-700 rounded-lg"
                          placeholder="e.g., 5551234567"
                        >
                      </div>

                      <!-- Carrier Select -->
                      <div class="mb-3">
                        <label [for]="'carrier-' + i" class="block text-sm font-medium text-gray-400">Carrier Gateway</label>
                        <select
                          [id]="'carrier-' + i"
                          [ngModel]="adminState().notifications[i]?.carrier || ''"
                          (ngModelChange)="updateNotification(i, 'carrier', $event)"
                          class="w-full px-4 py-2 text-gray-900 bg-gray-200 border border-gray-700 rounded-lg"
                        >
                          <option value="" disabled>-- Select Carrier --</option>
                          @for (carrier of carrierNames(); track carrier) {
                            <option [value]="carrier">{{ carrier }}</option>
                          }
                          <option value="Custom">Custom Domain (Advanced)</option>
                        </select>
                      </div>

                      <!-- Custom Domain Input (only shown if 'Custom' is selected) -->
                      @if (adminState().notifications[i]?.carrier === 'Custom') {
                        <div class="mt-2">
                          <label [for]="'custom-domain-' + i" class="block text-sm font-medium text-gray-400">Custom Domain</label>
                          <input
                            [id]="'custom-domain-' + i"
                            type="text"
                            [ngModel]="adminState().notifications[i]?.carrier === 'Custom' ? adminState().notifications[i]?.carrier : ''"
                            (ngModelChange)="updateNotification(i, 'carrier', $event)"
                            class="w-full px-4 py-2 text-gray-900 bg-gray-200 border border-gray-700 rounded-lg"
                            placeholder="e.g., mycarrier.net"
                          >
                        </div>
                      }
                    </div>
                  }
                  
                  @if (notificationMessage()) {
                    <p class="text-green-400 text-sm mt-4 mb-2">{{ notificationMessage() }}</p>
                  }

                  <button (click)="handleNotificationUpdate()"
                          class="mt-3 py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition duration-150">
                    Save Notification Settings
                  </button>
                </div>
              </div>
            }
          </div>
        }
      </div>

      <!-- PIN Modal -->
      @if (isPinModalOpen()) {
        <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div class="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm text-center">
            <h3 class="text-2xl font-bold mb-4 text-red-600 dark:text-red-400">Security Check</h3>
            <p class="mb-6 text-gray-700 dark:text-gray-300">
              A change of {{ Math.abs(pendingChange()!.amount) }} points is being applied.
              The total change in the last 5 minutes will exceed {{ adminState().pinThreshold }} points. 
              Please enter the 4-digit PIN to approve.
            </p>
            <input
              type="password"
              maxlength="4"
              [(ngModel)]="pinInput"
              (keyup.enter)="checkPin()"
              autofocus
              class="w-full text-center text-4xl tracking-widest px-4 py-3 border-2 border-red-400 rounded-lg mb-4 text-gray-900 focus:ring-red-500"
              placeholder="PIN"
            >
            @if (pinError()) {
              <p class="text-red-500 mb-2">{{ pinError() }}</p>
            }
            <div class="flex space-x-4">
              <button (click)="isPinModalOpen.set(false); pinInput.set(''); pinError.set(''); pendingChange.set(null);"
                      class="flex-1 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold transition duration-150">
                Cancel
              </button>
              <button (click)="checkPin()"
                      class="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition duration-150">
                Approve Change
              </button>
            </div>
          </div>
        </div>
      }
    </div>
    <!-- Custom Tailwind Styling to hide native radio buttons but show custom div -->
    <style>
      .radio-container input[type="radio"]:checked + div {
        --tw-bg-opacity: 1;
        background-color: rgb(79 70 229 / var(--tw-bg-opacity)); /* Indigo-600 */
        color: white;
        --tw-border-opacity: 1;
        border-color: rgb(67 56 202 / var(--tw-border-opacity)); /* Indigo-700 */
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
      }
    </style>
  `,
  styles: [`
    /* Tailwind is assumed to be available */
    :host {
      display: block;
    }
    .tab-button {
      padding: 12px 20px;
      font-weight: 600;
      border-radius: 12px 12px 0 0;
      transition: all 0.2s;
    }
    .tab-button.active {
      transform: translateY(2px);
      box-shadow: 0 -4px 6px -1px rgba(0, 0, 0, 0.2);
    }
    .radio-container {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
      gap: 10px;
    }
    /* Mobile-first adjustments for better touch targets */
    @media (max-width: 640px) {
      .radio-container {
        grid-template-columns: repeat(3, 1fr);
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  // Expose Math object to the template
  public readonly Math = Math;
  public readonly CARRIER_GATEWAYS = CARRIER_GATEWAYS;

  // Dependency Injection via inject function
  private http = inject(HttpClient);

  // Expose BACKEND_TYPE to template
  public readonly BACKEND_TYPE = BACKEND_TYPE;


  // --- Firebase & Auth Signals (RETAINED FOR FIREBASE PATH) ---
  private db: Firestore | undefined = undefined;
  private auth: any = undefined;
  userId = signal<string | null>(null);
  appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

  // --- Core App State ---
  activeTab = signal<'Lila' | 'Maryn' | 'Admin'>('Lila');
  scores = signal<{ [key: string]: number }>({ Lila: 0, Maryn: 0 });
  selectedValue = signal<number>(1);
  points: number[] = [1, 5, 10, 15, 20, 50, 100, 200, 300, 500, 700, 800, 1000];
  customValueInput = signal<string>('');
  changeMessage = signal<string>('');

  // --- Security & Time Tracking State ---
  isPinModalOpen = signal(false);
  // STRICT TYPE FIX: pendingChange uses specific union type for 'tab'
  pendingChange = signal<{ tab: 'Lila' | 'Maryn', amount: number, timestamp: number } | null>(null);
  pinInput = signal('');
  pinError = signal('');
  
  adminState = signal<{ 
    currentPin: string, 
    adminPassHash: string, 
    notifications: NotificationConfig[], 
    changeHistory: { [key: string]: PointChange[] },
    pinThreshold: number
  }>({
    currentPin: DEFAULT_PIN,
    adminPassHash: DEFAULT_ADMIN_PASSWORD_HASH, 
    notifications: Array(5).fill({ phone: '', carrier: '' }),
    changeHistory: { Lila: [], Maryn: [] },
    pinThreshold: DEFAULT_THRESHOLD
  });
  
  // Input for Admin Threshold & Password
  adminThresholdInput: number = DEFAULT_THRESHOLD;
  newAdminPassInput = signal(''); 


  // --- Admin Panel State ---
  isAdminLoggedIn = signal(false);
  adminLoginPass = ''; 
  adminLoginError = signal<string | null>(null);
  adminPinInput: string = '';
  adminMessage = signal<string | null>(null);
  notificationMessage = signal<string | null>(null);


  constructor() {
    effect(() => {
        const customVal = parseInt(this.customValueInput(), 10);
        if (!isNaN(customVal) && customVal > 0) {
            this.selectedValue.set(customVal);
        } else if (this.customValueInput() !== '') {
            this.selectedValue.set(this.points[0]);
        }
    });
  }

  ngOnInit() {
    if (BACKEND_TYPE === 'FIREBASE') {
        this.initializeFirebase();
    } else {
        this.fetchInitialMongoData();
    }
  }

  // Helper to construct full state object including scores for saving
  private getFullState(): AppState {
    return {
      scores: this.scores(),
      ...this.adminState()
    };
  }

  // Helper to expose carrier names for template dropdown
  carrierNames = () => Object.keys(CARRIER_GATEWAYS);


  // --- Helper: SHA-256 Hashing for Client-Side Admin Password Check ---
  private async sha256(s: string): Promise<string> {
      const msgUint8 = new TextEncoder().encode(s);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex;
  }
  
  // --- MONGO DB/HTTP Logic ---
  private async fetchInitialMongoData(): Promise<void> {
    const httpOptions = { 
        headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
    };

    try {
        const data = await lastValueFrom(this.http.get<AppState>(API_STATE_ENDPOINT, httpOptions));
        this.updateStateFromBackend(data);
        console.warn("MongoDB initial data loaded successfully from Render.");
    } catch (e) {
        console.error("CRITICAL ERROR: Failed to fetch initial MongoDB data (Is Flask server running?).", e);
        // Initialize with default local state if API fails
        this.updateStateFromBackend(this.getInitialState());
    }
  }

  private async saveDataToMongo(data: AppState): Promise<void> {
      const httpOptions = { 
        headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
      };

      try {
          await lastValueFrom(this.http.post(API_STATE_ENDPOINT, data, httpOptions));
          // CRITICAL FIX: Update local state immediately after successful save
          this.updateStateFromBackend(data);
          console.warn('Data saved to MongoDB API successfully.');
      } catch (e) {
          console.error("CRITICAL ERROR: Failed to save data to MongoDB API (Check Flask server/CORS).", e);
          this.changeMessage.set('ERROR: Could not save data. Check local server connection.');
          setTimeout(() => this.changeMessage.set(''), 5000);
          throw e; 
      }
  }
  
  private getInitialState(): AppState {
    return {
        scores: { Lila: 0, Maryn: 0 },
        currentPin: DEFAULT_PIN,
        adminPassHash: DEFAULT_ADMIN_PASSWORD_HASH,
        pinThreshold: DEFAULT_THRESHOLD,
        notifications: Array(5).fill({ phone: '', carrier: '' }),
        changeHistory: { Lila: [], Maryn: [] }
    };
  }
  
  private updateStateFromBackend(data: AppState): void {
      this.scores.set(data.scores || { Lila: 0, Maryn: 0 });
      this.adminState.set({
          currentPin: data.currentPin || DEFAULT_PIN,
          adminPassHash: data.adminPassHash || DEFAULT_ADMIN_PASSWORD_HASH,
          pinThreshold: data.pinThreshold || DEFAULT_THRESHOLD,
          notifications: data.notifications || Array(5).fill({ phone: '', carrier: '' }),
          changeHistory: data.changeHistory || { Lila: [], Maryn: [] }
      });
      this.adminThresholdInput = this.adminState().pinThreshold;
  }

  // --- FIREBASE Logic (Only runs if BACKEND_TYPE === 'FIREBASE') ---
  private async initializeFirebase(): Promise<void> {
    if (BACKEND_TYPE !== 'FIREBASE') return;
    
    try {
      // NOTE: This logic remains for the Firebase path, but is currently unused.
      let configString = typeof __firebase_config === 'string' && __firebase_config !== 'undefined' ? __firebase_config : '{}';
      const firebaseConfig = JSON.parse(configString);

      if (Object.keys(firebaseConfig).length === 0) {
          console.error("CRITICAL: Firebase config is missing or invalid.");
          return;
      }

      const app = initializeApp(firebaseConfig);
      this.db = getFirestore(app);
      this.auth = getAuth(app);

      if (typeof __initial_auth_token !== 'undefined') {
        await signInWithCustomToken(this.auth, __initial_auth_token);
      } else {
        await signInAnonymously(this.auth);
      }

      onAuthStateChanged(this.auth, (user: User | null) => {
        if (user) {
          this.userId.set(user.uid);
          this.setupFirebaseListener();
        } else {
          this.userId.set(null);
        }
      });
      
      console.warn("Firebase Initialization Complete. User authentication initiated.");

    } catch (e) {
      console.error("CRITICAL ERROR: Firebase initialization failed.", e);
    }
  }

  private setupFirebaseListener(): void {
    const userId = this.userId();
    if (!this.db || !userId) return; 

    const docRef = doc(this.db, 'artifacts', this.appId, 'public', 'data', 'point-state', 'shared');

    onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as AppState;
        this.updateStateFromBackend(data);
        console.debug('Data loaded from Firestore successfully.');
      } else {
        this.saveDataToBackend(this.getInitialState());
      }
    }, (error) => {
      console.error('Error listening to Firestore:', error);
    });
  }
  
  private async saveDataToFirebase(data: AppState): Promise<void> {
    const userId = this.userId();
    if (!this.db || !userId) return;
    
    const docRef = doc(this.db, 'artifacts', this.appId, 'public', 'data', 'point-state', 'shared');
    try {
        await setDoc(docRef, data, { merge: true });
        console.warn('Data written to Firestore successfully.');
    } catch (e) {
        console.error('Firestore Save Failed:', e);
    }
  }

  // --- CORE BACKEND ABSTRACTION ---
  private async saveDataToBackend(data: AppState): Promise<void> {
    if (BACKEND_TYPE === 'FIREBASE') {
        await this.saveDataToFirebase(data);
    } else {
        await this.saveDataToMongo(data);
    }
  }
  

  // --- UI/Tab Logic ---
  setActiveTab(tab: 'Lila' | 'Maryn' | 'Admin'): void {
    if (this.activeTab() === 'Admin' && tab !== 'Admin') {
      this.isAdminLoggedIn.set(false); // Log out when leaving Admin tab
    }
    this.activeTab.set(tab);
  }

  getTabClass(tab: string, baseClasses: string): string {
    const active = this.activeTab() === tab;
    return `tab-button px-4 py-2 ${baseClasses} ${active ? 'active shadow-inner' : 'opacity-70'} focus:outline-none`;
  }

  commonControlsClass(): string {
    return 'p-4 rounded-xl shadow-inner bg-opacity-70';
  }
  
  selectPointValue(value: number): void {
    this.selectedValue.set(value);
    this.customValueInput.set('');
  }

  handleCustomValueChange(value: string | number): void {
    const num = parseInt(value.toString(), 10);
    this.customValueInput.set(value.toString());
    if (!isNaN(num) && num >= 1) {
      this.selectedValue.set(num);
    } else if (value === '') {
      // If cleared, default to the smallest available point value
      this.selectedValue.set(this.points[0]);
    }
  }


  // --- Main Point Change Logic (Cumulative Security) ---
  private getCumulativeChange(tab: 'Lila' | 'Maryn', now: number): number {
    const cutoff = now - FIVE_MINUTES_MS;
    const history = this.adminState().changeHistory[tab] || [];

    // Filter out old changes and sum the absolute amounts of remaining changes
    return history
      .filter(c => c.timestamp >= cutoff)
      .reduce((sum, c) => sum + Math.abs(c.amount), 0);
  }
  
  changePoints(tab: 'Lila' | 'Maryn', type: 'increment' | 'decrement'): void {
    this.changeMessage.set('');
    const amount = this.selectedValue() * (type === 'increment' ? 1 : -1);
    const now = Date.now();
    const threshold = this.adminState().pinThreshold;

    // 1. Calculate cumulative change in the last 5 minutes BEFORE the current transaction.
    const cumulativeChange = this.getCumulativeChange(tab, now);
    const absAmount = Math.abs(amount);
    const totalChangeAfter = cumulativeChange + absAmount;

    let currentState = this.adminState();
    let newScores = { ...this.scores() };

    // 2. Check for PIN requirement: Total change (cumulative + current) > threshold
    if (totalChangeAfter > threshold) {
      
      // Reset history on PIN challenge trigger
      let clearedHistory = { ...currentState.changeHistory, [tab]: [] };
      
      this.saveDataToBackend({
            ...currentState,
            scores: newScores,
            changeHistory: clearedHistory, // History is cleared here
        }
      );

      // Set pending change and open PIN modal
      this.pendingChange.set({ tab, amount, timestamp: now });
      this.pinInput.set('');
      this.pinError.set('');
      this.isPinModalOpen.set(true);
      return;
    }

    // Apply change immediately if PIN is not required
    this.applyChange(tab, amount, now);
  }

  checkPin(): void {
    const pending = this.pendingChange();
    if (!pending) return;

    if (this.pinInput() === this.adminState().currentPin) {
      this.pinError.set('');
      const { tab, amount, timestamp } = pending;
      
      this.applyApprovedChange(tab, amount, timestamp);

      // Close and reset modal
      this.isPinModalOpen.set(false);
      this.pinInput.set('');
      this.pendingChange.set(null);
    } else {
      this.pinError.set('Incorrect PIN. Try again.');
      this.pinInput.set(''); // Clear input after failed attempt
    }
  }

  /**
   * Applies the score change after the PIN has been approved.
   */
  private applyApprovedChange(tab: 'Lila' | 'Maryn', amount: number, timestamp: number): void {
    const newScores = { ...this.scores() };
    newScores[tab] += amount;

    // History was cleared when modal was triggered. 
    // Now we add the approved change to the (now cleared) history array.
    const history = [{ amount: amount, timestamp: timestamp }];
    const newChangeHistory = { ...this.adminState().changeHistory, [tab]: history };

    const adminSettings = this.adminState();
    const dataToSend = {
        ...adminSettings,
        scores: newScores,
        changeHistory: newChangeHistory,
    };
    
    this.saveDataToBackend(dataToSend);

    // SMS/Email-to-Text Notification Trigger
    if (Math.abs(amount) >= 10) {
      // Trigger the dedicated notification save *after* the score update save completes
      this.triggerNotification(tab, amount);
    }
  }


  private applyChange(tab: 'Lila' | 'Maryn', amount: number, timestamp: number): void {
    const newScores = { ...this.scores() };
    newScores[tab] += amount;

    // 1. Update the change history (filter old, add new)
    const history = this.adminState().changeHistory[tab] || [];
    const cutoff = timestamp - FIVE_MINUTES_MS;

    const newHistory = history
      .filter(c => c.timestamp >= cutoff) // Keep only changes within the last 5 minutes
      .concat([{ amount: amount, timestamp: timestamp }]);
    
    // 2. Prepare the full history object for saving
    const newChangeHistory = { ...this.adminState().changeHistory, [tab]: newHistory };

    // 3. Save to Backend
    const adminSettings = this.adminState();
    const dataToSend = {
        ...adminSettings,
        scores: newScores,
        changeHistory: newChangeHistory,
    };
    this.saveDataToBackend(dataToSend);

    // 4. SMS/Email-to-Text Notification Trigger
    if (Math.abs(amount) >= 10) {
      this.triggerNotification(tab, amount);
    }
  }

  /**
   * CRITICAL FIX: Forces a dedicated, guaranteed write to ensure the Cloud Function fires.
   */
  private async triggerNotification(tab: string, amount: number): Promise<void> {
    const direction = amount > 0 ? 'increased' : 'decreased';
    const absAmount = Math.abs(amount);
    
    const notificationList = this.adminState().notifications
        .filter(n => n.phone && n.carrier);

    // Check if we have any valid recipients before attempting to send
    if (notificationList.length === 0) {
      console.warn("No valid recipients configured. Skipping notification API call.");
      // Optionally set a message in the UI, but do NOT call the API
      return; 
    }

    const emailList = notificationList.map(n => {
        const domain = CARRIER_GATEWAYS[n.carrier] || n.carrier;
        return `${n.phone}@${domain}`;
    }).join(', ');
    
    // Prepare a lightweight notification-specific payload
    const notificationPayload = {
        notificationTriggerTimestamp: Date.now(),
        notificationMessage: `The ${tab} counter was ${direction} by ${absAmount} points.`,
        notifications: notificationList
    };

    if (BACKEND_TYPE === 'FIREBASE') {
        // Firebase implementation requires a dedicated write to trigger Cloud Function
        const userId = this.userId();
        if (!this.db || !userId) return;
        const docRef = doc(this.db, 'artifacts', this.appId, 'public', 'data', 'point-state', 'shared');
        try {
            await setDoc(docRef, notificationPayload, { merge: true });
        } catch (e) {
            console.error("Failed to trigger notification write:", e);
        }
    } else {
        // MONGO DB implementation relies on the API to handle the email sending
        try {
            // Note: The /notify endpoint handles the email logic on the server
            const httpOptions = { headers: new HttpHeaders({ 'Content-Type': 'application/json' }) };
            
            // FIX: Check response success before showing "Notification Sent"
            await lastValueFrom(this.http.post(API_NOTIFY_ENDPOINT, notificationPayload, httpOptions));
            
            console.warn(`
              ********************************************************************************
              *** Email-to-Text Notification Sent (Live) ***
              ********************************************************************************
              Emails Triggered: ${emailList}
            `);

            this.changeMessage.set(`Change approved. Notification trigger sent.`);
            setTimeout(() => this.changeMessage.set(''), 5000); 

        } catch (e) {
            console.error("Failed to trigger notification API:", e);
            this.changeMessage.set(`Change approved, but notification FAILED.`);
            setTimeout(() => this.changeMessage.set(''), 5000); 
        }
    }
  }


  // --- Admin Handlers ---

  async handleAdminLogin(): Promise<void> {
    this.adminLoginError.set(null);
    const passwordAttempt = this.adminLoginPass.trim();
    
    if (!passwordAttempt) {
        this.adminLoginError.set('Password cannot be empty.');
        return;
    }

    try {
        const inputHash = await this.sha256(passwordAttempt);
        
        if (inputHash === this.adminState().adminPassHash) {
          this.isAdminLoggedIn.set(true);
          this.adminPinInput = this.adminState().currentPin;
          this.adminLoginPass = '';
        } else {
          this.adminLoginError.set('Incorrect Admin Password.');
        }
    } catch (error) {
        this.adminLoginError.set('An error occurred during authentication.');
        console.error('Hashing error:', error);
    }
  }
  
  handleAdminPasswordUpdate(): void {
    this.adminMessage.set(null);
    const newPass = this.newAdminPassInput().trim(); // FIX: Access signal with ()

    if (newPass.length < 4) {
        this.adminMessage.set('New password must be at least 4 characters long.');
        return;
    }

    this.sha256(newPass).then(newHash => {
        const fullState = this.getFullState();
        const dataToSend = { ...fullState, adminPassHash: newHash };
        this.saveDataToBackend(dataToSend);
        
        // Final cleanup and UX update
        this.newAdminPassInput.set('');
        this.isAdminLoggedIn.set(false); // Force re-login with new password
        this.adminMessage.set('Admin Password updated successfully! Please re-login.');
        setTimeout(() => this.adminMessage.set(null), 5000);
    }).catch(e => {
        this.adminMessage.set('Error updating password.');
        console.error('Password update hashing failed:', e);
    });
  }

  handlePinUpdate(): void {
    const newPin = this.adminPinInput.trim();
    if (/^\d{4}$/.test(newPin)) {
        const fullState = this.getFullState();
        const dataToSend = { ...fullState, currentPin: newPin };
        this.saveDataToBackend(dataToSend);
        this.adminMessage.set('PIN updated successfully!');
        setTimeout(() => this.adminMessage.set(null), 3000);
    } else {
        this.adminMessage.set('PIN must be exactly 4 digits.');
    }
  }

  handleThresholdUpdate(): void {
    const newThreshold = parseInt(this.adminThresholdInput.toString(), 10);
    if (!isNaN(newThreshold) && newThreshold >= 1) {
        const fullState = this.getFullState();
        const dataToSend = { ...fullState, pinThreshold: newThreshold };
        this.saveDataToBackend(dataToSend);
        this.adminMessage.set(`Threshold updated to ${newThreshold} pts successfully!`);
        setTimeout(() => this.adminMessage.set(null), 3000);
    } else {
        this.adminMessage.set('Threshold must be a number greater than 0.');
    }
  }

  // Handles updating the complex notification structure
  updateNotification(index: number, field: 'phone' | 'carrier', value: string): void {
    this.adminState.update(state => {
      let newNotifications = [...state.notifications];
      
      // Ensure the object at the index exists
      if (!newNotifications[index]) {
        newNotifications[index] = { phone: '', carrier: '' };
      }

      // Basic phone number sanitation (remove non-digits)
      let cleanedValue = value;
      if (field === 'phone') {
        cleanedValue = value.replace(/\D/g, '').substring(0, 10); // Keep only 10 digits
      }
      
      newNotifications[index] = { ...newNotifications[index], [field]: cleanedValue };
      return { ...state, notifications: newNotifications };
    });
  }

  handleNotificationUpdate(): void {
    const notifications = this.adminState().notifications
        .map(n => ({
            phone: n.phone.trim(),
            carrier: n.carrier.trim()
        }))
        .filter(n => n.phone && n.carrier); // Only save records with both fields filled

    // If less than 5 are set, pad the array back to 5 for consistency with the template
    while (notifications.length < 5) {
        notifications.push({ phone: '', carrier: '' });
    }

    const fullState = this.getFullState();
    const dataToSend = { ...fullState, notifications: notifications };

    this.saveDataToBackend(dataToSend)
        .then(() => {
            this.notificationMessage.set('Notification settings saved successfully!');
            setTimeout(() => this.notificationMessage.set(null), 3000);
        })
        .catch(e => {
            this.notificationMessage.set('Error saving settings. See console.');
            console.error('Error saving notifications:', e);
            setTimeout(() => this.notificationMessage.set(null), 3000);
        });
  }
}