
import mongoose from 'mongoose';
const UserSchema = new mongoose.Schema({
  email: String,
  officeLat: Number,
  officeLng: Number
}, { collection: 'users' });
const User = mongoose.model('User', UserSchema);

async function check() {
  await mongoose.connect('mongodb://localhost:27017/attend');
  const users = await User.find({ officeLat: { $exists: true } });
  console.log(JSON.stringify(users.map(u => ({ email: u.email, lat: u.officeLat, lng: u.officeLng })), null, 2));
  await mongoose.disconnect();
}
check();
