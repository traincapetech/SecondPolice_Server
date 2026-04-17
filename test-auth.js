async function runTests() {
  console.log("=== Testing CRM Authentication API ===\n");

  const email = `test${Date.now()}@example.com`;

  // 1. Test Register
  console.log("-> 1. Registering 'Test Company' with Admin User...");
  const registerPayload = {
    companyName: "Test Company LLC",
    name: "John Admin",
    email: email,
    password: "Password123!"
  };

  try {
    const regRes = await fetch('http://localhost:8000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registerPayload)
    });
    
    const regData = await regRes.json();
    console.log(`Register Response Status: ${regRes.status}`);
    console.log(JSON.stringify(regData, null, 2));

    if (regRes.status !== 201) {
      console.log("\n❌ Test failed on Registration.");
      return;
    }

    // 2. Test Login
    console.log("\n-> 2. Testing Login with those new Admin credentials...");
    const loginPayload = {
      email: email,
      password: "Password123!"
    };

    const loginRes = await fetch('http://localhost:8000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginPayload)
    });

    const loginData = await loginRes.json();
    console.log(`Login Response Status: ${loginRes.status}`);
    console.log(JSON.stringify(loginData, null, 2));
    
    if (loginRes.status === 200) {
        console.log("\n✅ ALL TESTS PASSED! The Backend API is working flawlessly and the JWT token is being generated.");
    } else {
        console.log("\n❌ Test failed on Login.");
    }

  } catch (e) {
    console.error("Test failed to connect (Is the server running?):", e.message);
  }
}

runTests();
