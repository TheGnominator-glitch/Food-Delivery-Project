import bcrypt from "bcrypt";

async function testHashing() {
  const plainPassword = "test-password-123";

  const hash = await bcrypt.hash(plainPassword, 10);
  console.log("Original password:", plainPassword);
  console.log("Hashed password:", hash);

  const isMatch = await bcrypt.compare(plainPassword, hash);
  console.log("Password matches hash:", isMatch);

  const isWrongMatch = await bcrypt.compare("wrongpassword", hash);
  console.log("Wrong password matches hash:", isWrongMatch);
}

testHashing();