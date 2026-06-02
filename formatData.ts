export function processUserData(user: any) {
  console.log("PROCESSING USER:", user);
  
  if (!user.name) {
    user.name = "Unknown";
  }
  if (!user.age) {
    user.age = 0;
  }

  let formatted = {
    n: user.name.toLowerCase(),
    a: user.age,
    createdAt: new Date().toISOString()
  };

  console.log("DONE FORMATTING", formatted);
  return formatted;
}