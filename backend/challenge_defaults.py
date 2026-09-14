"""A gentle, editable 30-day practice. No purchased media or external services."""
PRACTICES = [
    ("Arrive on your mat", 10, "Sit comfortably for two minutes and notice your natural breath. Move through gentle shoulder rolls and easy seated side stretches. Finish with three quiet minutes of rest."),
    ("Find your foundation", 12, "Stand with support nearby. Notice the contact of your feet with the floor. Practise comfortable weight shifts, then rest seated. Keep the breath easy."),
    ("Space for your shoulders", 10, "Seated or standing, slowly circle your shoulders. Reach one arm at a time within a comfortable range. Pause between rounds and finish with quiet breathing."),
    ("A supple spine", 12, "Try small seated pelvic tilts and gentle seated cat–cow movements. Move with your natural breath, keeping the neck comfortable. Rest on your back or in a chair."),
    ("Steady and supported", 15, "Stand beside a wall or sturdy chair. Practise small heel raises and a supported balance with both toes near the floor. Change sides and rest whenever needed."),
    ("Breathe and soften", 10, "Choose a comfortable seat. Observe the breath without holding it or forcing its length. Relax your jaw and shoulders. Finish with a short body scan."),
    ("Rest and reflect", 10, "Rest in a comfortable position with cushions if helpful. Notice sensations from feet to face. Reflect on one thing that felt good in your first week."),
    ("Begin again", 15, "Repeat your favourite gentle movements from week one. Alternate movement with short pauses. End with two minutes of stillness."),
    ("Easy side stretches", 12, "Sit tall in a chair. Rest one hand beside you and make a small side reach with the other. Keep both sitting bones supported. Repeat gently on both sides."),
    ("Grounded standing", 15, "Stand beside a wall. Explore a comfortable stance and small, supported knee bends. Keep movement easy and finish with seated rest."),
    ("Gentle mobility", 15, "Slowly move your wrists, ankles and shoulders through comfortable circles. Follow with seated cat–cow. Let the movement remain small and unhurried."),
    ("A little balance", 12, "With a chair for support, shift weight from one foot to the other. If comfortable, briefly lift one heel. Keep looking ahead and use support throughout."),
    ("Quiet attention", 10, "Settle into a supported seat. Follow the sensation of breathing for a few minutes. When attention wanders, gently return to the breath without judgement."),
    ("Permission to pause", 10, "Make today a restful practice. Lie down or sit supported, soften your shoulders and notice your breath. Let the body settle without trying to change it."),
    ("Halfway, here", 15, "Choose three familiar movements from the last two weeks. Practise slowly, with rest between each. Notice how it feels to return to a regular practice."),
    ("Comfortable length", 15, "Seated or standing with support, gently reach upward within your comfortable range. Release your arms fully between repetitions. Finish with easy shoulder rolls."),
    ("Move with awareness", 15, "Combine gentle seated cat–cow, shoulder rolls and small side stretches. Take a quiet pause after each movement and keep your breath natural."),
    ("Supported strength", 15, "Use a stable chair or wall. Practise a few small standing knee bends and heel raises. Choose a range that feels steady and rest before you become tired."),
    ("Softening the edges", 12, "Sit comfortably and relax your hands, face and jaw. Add easy shoulder rolls and a small seated side reach. End in stillness."),
    ("Breath as an anchor", 10, "Notice the contact of your body with its support. Follow several natural breaths, without breath holds. Allow your attention to return gently whenever it wanders."),
    ("Three-week reflection", 10, "Choose a comfortable resting position. Scan the body slowly and reflect on the practices you enjoyed. No stretching or effort is needed today."),
    ("Your familiar rhythm", 18, "Build a gentle sequence from four familiar movements. Include seated mobility, supported standing and a period of rest. Stay within a comfortable range."),
    ("Space and ease", 15, "Repeat gentle seated side stretches and shoulder rolls. Take time to settle between movements. Let each repetition be a little slower rather than deeper."),
    ("Find your steadiness", 15, "Stand beside a chair and explore supported weight shifts and small heel raises. Keep the chair within reach. Finish with relaxed breathing in a seat."),
    ("Mindful transitions", 15, "Move slowly between a comfortable seat and supported standing, if accessible to you. Otherwise alternate seated movement and stillness. Notice each transition."),
    ("Your own gentle sequence", 20, "Choose movements from this challenge that feel good today. Alternate easy mobility, supported standing and rest. Leave out anything that does not suit your body."),
    ("Listen and adapt", 12, "Begin with a short body scan. Choose either gentle seated movement or a restful practice based on how you feel. Let comfort guide your choices."),
    ("A restful reset", 10, "Settle into a supported resting position. Relax your hands and face. Notice your breath without changing it and give yourself permission to be still."),
    ("Practice to keep", 20, "Return to your favourite sequence from the month. Notice which movements you would like to keep in your routine. End with at least three minutes of rest."),
    ("Thirty days of showing up", 15, "Choose a few favourite gentle movements, then settle into rest. Reflect on what you have learned about your practice and one intention for the coming month."),
]


def default_challenge():
    return {"id": "30-day-practice", "title": "30 days of showing up", "description": "A little practice. A little more presence. Your next thirty days start here.",
        "days": [{"day": i + 1, "title": title, "duration_minutes": duration, "instructions": instructions}
                 for i, (title, duration, instructions) in enumerate(PRACTICES)]}