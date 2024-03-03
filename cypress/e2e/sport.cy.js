/* eslint-disable no-undef */
describe("Sport Application", () => {
  const baseUrl = "http://localhost:3000";
  beforeEach(() => {
    cy.visit(baseUrl);
  });

  it("Signs up", () => {
    cy.visit(`${baseUrl}/signup`);
    cy.get('input[name="firstName"]').type("Test");
    cy.get('input[name="lastName"]').type("User A");
    cy.get('input[name="email"]').type("user.a@test.com");
    cy.get('select[name="role"]').select("Admin");
    cy.get('input[name="password"]').type("12345678");
    cy.get('button[type="submit"]').click();
    cy.log("Current URL:", cy.url());
  });

  it("Sign out", () => {
    // Visit the sport page and then sign out
    cy.visit(`${baseUrl}/sport`);
    cy.request(`${baseUrl}/signout`);
  });

  it("Logs in with valid credentials", () => {
    cy.visit(`${baseUrl}/login`);
    // Fill out the login form
    cy.get('input[name="email"]').type("user.a@test.com");
    cy.get('input[name="password"]').type("12345678");

    // Submit the form
    cy.get("form").submit();
    cy.visit(`${baseUrl}/sport`); // Assuming successful login
  });
});
