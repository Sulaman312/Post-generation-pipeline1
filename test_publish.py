from backend.integrations import meta_graph

image_path = r"D:\Post-generation-pipeline1\img.jpg"

fb_id = meta_graph.publish_facebook_post(image_path, "test caption")
print("FB:", fb_id)

ig_id = meta_graph.publish_instagram_post(image_path, "test caption")
print("IG:", ig_id)