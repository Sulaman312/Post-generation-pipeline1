from backend.integrations import linkedin_api

image_path = r"D:\Post-generation-pipeline1\img.jpg"

li_id = linkedin_api.publish_linkedin_post(image_path, "test caption")
print("LI:", li_id)