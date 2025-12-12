-- Function to create profile on user signup (works for both email/password and OAuth)
CREATE OR REPLACE FUNCTION public.applihero_handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, email_notifications, marketing_emails, active)
  VALUES (
    NEW.id, 
    NEW.email, 
    true, 
    false, 
    true
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run the function when a new user is created in auth.users
DROP TRIGGER IF EXISTS applihero_on_auth_user_created ON auth.users;
CREATE TRIGGER applihero_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.applihero_handle_new_user();

