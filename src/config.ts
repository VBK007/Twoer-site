/**
 * Site and client configuration.
 *
 * The successor to the old `js/config.js`. Same job — the handful of values a
 * deploy needs to change — but typed, and now covering the web client as well
 * as the download card.
 */
export const TOWER = {
  /* ── Download page ──────────────────────────────────────────────────── */

  /** Where the .apk actually lives, relative to this site or a full URL. */
  apkUrl: '/downloads/tower-1.0.apk',

  /** Your `https://discord.gg/...` link. Blank disables the button and says why. */
  discordInvite: '',

  /** Shown on the download card. Keep in step with composeApp/build.gradle.kts. */
  version: '1.0',
  /* The real size of the signed release in public/downloads. Measured, not
     estimated — the download card is one of the few places on the page that
     makes a promise a visitor can check before clicking. */
  apkSize: '8.2 MB',
  minAndroid: 'Android 8.0',

  /* ── Web client ─────────────────────────────────────────────────────── */

  /**
   * The server address the web client opens on, so nobody has to type a URL.
   *
   * Blank is fine and is the honest default for a public site: the Connect
   * screen asks. Filling it in bakes *your* house into the build, which is the
   * right thing only if you are hosting this for your own household.
   *
   * A remembered address still wins over this.
   */
  defaultBaseUrl: '',

  /**
   * The Firestore document the server publishes its current address to.
   *
   * This is where the endpoint comes from. A visitor with nothing remembered
   * gets sent straight here rather than being asked to type an address they
   * would have to look up — which matters more in a browser than on the phone,
   * because a tunnel hostname changes on every restart and nobody is going to
   * copy a new one into a laptop each time.
   *
   * Mirrors ServerDirectory.kt exactly — same project, same database, same
   * document — so the phone and the browser follow the server to the same
   * place. `databaseId` is deliberately not `(default)`: this project's
   * database was created with a name, and asking for the default one gets a
   * 404 that reads exactly like "no document yet".
   *
   * The API key is not a secret. It names a project and authorises nothing by
   * itself; what it may read is decided by that project's rules, which allow
   * anyone to read this one document and nobody to write it. It already ships
   * inside the APK for the same reason.
   *
   * Worth being deliberate about, though: publishing this site publicly also
   * publishes your server's current address to anyone who loads the page. The
   * server still refuses everything without a sign-in, but it is no longer
   * unlisted. Blank out `projectId` to turn the lookup off and make Connect ask
   * instead.
   */
  directory: {
    projectId: 'familytracking-79628',
    apiKey: 'AIzaSyDcjJtLCB51mrSV-2TyTfoLnI75gYmDGaE',
    databaseId: 'codeplays-manage17498',
    documentPath: 'config/server',
  },

  /* ── Advertising ────────────────────────────────────────────────────── */

  /**
   * Google AdSense, in the web client only.
   *
   * The download page carries no ads and never will: somebody who came for
   * the APK should get the APK. The client's screens — Home, Library, a
   * title's page — each have one named place for an ad, and the sidebar on a
   * desktop has a fourth. Nothing is placed inside the player.
   *
   * `adsenseClient` is your `ca-pub-…` publisher ID. Blank turns every slot
   * off. Each entry in `slots` is the ad unit ID AdSense gives you for that
   * placement; a blank one hides that placement alone.
   *
   * `placeholders` draws a dashed outline wherever an ad would go while
   * nothing is configured, so the placements can be looked at in a preview
   * before there is an account to fill them. Set it to false before shipping
   * a build with no IDs, or visitors see the outlines too.
   */
  ads: {
    adsenseClient: 'ca-pub-5680495978583576',
    slots: {
      side: '',
      home: '',
      library: '',
      detail: '',
    },
    placeholders: false,
  },
} as const
