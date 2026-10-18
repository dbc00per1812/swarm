import { expect, test } from "@playwright/test";

test(
  "a person uses the encrypted vault and a scoped agent through the real gateway and database",
  async ({ page, request }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto("/");
    await page.getByText("Sign in with an existing email account", {
      exact: true,
    }).click();
    await page.getByLabel("Email address", { exact: true }).fill(
      "browser@example.test",
    );
    await page.getByLabel("Password", { exact: true }).fill(
      "synthetic-password",
    );
    await page.getByRole("button", { name: "Sign in with email", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "GitHub · Engineering", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Engineering", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("connectors-desktop-light.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Vault", exact: true }).click();
    await page.getByLabel("Vault passphrase", { exact: true }).fill(
      "synthetic old vault passphrase",
    );
    await page.getByLabel("Confirm passphrase", { exact: true }).fill(
      "synthetic old vault passphrase",
    );
    await page.getByRole("button", { name: "Create vault", exact: true })
      .click();
    await page.getByRole("button", { name: "Add item", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill("Stripe development");
    await page.getByLabel("Provider", { exact: true }).fill("Stripe");
    await page.getByLabel("Environment", { exact: true }).fill("Development");
    await page.getByLabel("API key", { exact: true }).fill(
      "synthetic-key-not-live",
    );
    await page.getByRole("button", { name: "Save item", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Stripe development", exact: true }),
    ).toBeVisible();
    const envelope = await request.get("/functions/v1/mcp/v1/vault", {
      headers: { Authorization: "Bearer synthetic-session" },
    });
    expect(envelope.ok()).toBeTruthy();
    expect(await envelope.text()).not.toContain("synthetic-key-not-live");
    await page.reload();
    await page.getByRole("button", { name: "Vault", exact: true }).click();
    await page.getByLabel("Vault passphrase", { exact: true }).fill(
      "synthetic old vault passphrase",
    );
    await page.getByRole("button", { name: "Unlock vault", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Stripe development", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Reveal key", exact: true }).click();
    await expect(page.getByText("synthetic-key-not-live", { exact: true }))
      .toBeVisible();
    await page.getByRole("button", { name: "Hide key", exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath("vault-desktop-light.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Change passphrase", exact: true })
      .click();
    await page.getByLabel("Current passphrase", { exact: true }).fill(
      "synthetic old vault passphrase",
    );
    await page.getByLabel("New passphrase", { exact: true }).fill(
      "synthetic new vault passphrase",
    );
    await page.getByLabel("Confirm new passphrase", { exact: true }).fill(
      "synthetic new vault passphrase",
    );
    await page.getByRole("button", { name: "Save passphrase", exact: true })
      .click();
    await expect(
      page.getByText(
        "Vault passphrase changed. Use the new passphrase when you unlock the vault.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Agent access", exact: true })
      .click();
    await page.getByLabel("Agent key name", { exact: true }).fill(
      "Research assistant",
    );
    await page.getByRole("checkbox", {
      name: "Read pull requests",
      exact: false,
    }).check();
    await page.getByRole("button", { name: "Create agent key", exact: true })
      .click();
    const token = page.getByLabel("Raw agent token", { exact: true });
    await expect(token).toBeVisible();
    const value = await token.inputValue();
    const call = (repo) =>
      request.post("/functions/v1/mcp", {
        headers: {
          Authorization: `Bearer ${value}`,
          Accept: "application/json, text/event-stream",
        },
        data: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "github_list_pull_requests",
            arguments: {
              owner: "example",
              repo,
              connection_id: "22222222-2222-4222-8222-222222222222",
            },
          },
        },
      });
    const denied = await call("private");
    expect(await denied.text()).toContain("outside");
    const allowed = await call("app");
    expect(await allowed.text()).toContain("Synthetic pull request");
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("table")).toContainText("Research assistant");
    await expect(page.getByRole("table")).toContainText("Denied");
    await expect(page.getByRole("table")).toContainText("Allowed");
    await page.screenshot({
      path: testInfo.outputPath("activity-desktop-light.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Vault", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Unlock vault", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Vault passphrase", { exact: true }).fill(
      "synthetic new vault passphrase",
    );
    await page.getByRole("button", { name: "Unlock vault", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Stripe development", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Connectors", exact: true }).click();
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({
      path: testInfo.outputPath("connectors-desktop-dark.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(
      page.getByRole("button", { name: "GitHub · Engineering", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        document.documentElement.scrollWidth > innerWidth
      ),
    ).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath("connectors-mobile-dark.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Agent access", exact: true })
      .click();
    await page.getByRole("button", {
      name: "Revoke Research assistant",
      exact: true,
    }).click();
    await expect(page.locator("#keys")).toContainText("Revoked");
    const revoked = await call("app");
    expect(revoked.status()).toBe(401);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Continue with GitHub", exact: true }),
    ).toBeVisible();
    expect(await page.locator("#vault-panel").textContent()).toBe("");
    expect(errors).toEqual([]);
  },
);
