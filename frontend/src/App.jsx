// App.jsx
import React, { useState, useRef } from "react";
import AgoraRTC from "agora-rtc-sdk-ng";

const APP_ID = "ff1153e90cbf4f5cbc055393a233ccbf";
const CHANNEL_NAME = "test-channel"; // fixed channel name

const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

const App = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [idToken, setIdToken] = useState(null);
  const [joined, setJoined] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);

  const videoRef = useRef(null);
  const localAudioTrack = useRef(null);
  const localVideoTrack = useRef(null);
  const localScreenTrack = useRef(null);
  const agoraToken = useRef(null);

  const handleLogin = async () => {
    if (!email || !password) return alert("Email and Password required");
    try {
      const res = await fetch("http://localhost:3000/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (res.ok) {
        setIdToken(data.IdToken);
        console.log(data);
        alert("Login successful");
      } else {
        alert(data.error || "Login failed");
      }
    } catch (err) {
      console.error(err);
      alert("Network or server error");
    }
  };

  const getAgoraToken = async () => {
    try {
      const res = await fetch("http://localhost:3000/api/agora/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ channelName: CHANNEL_NAME }),
      });

      const data = await res.json();
      console.log(data);
      if (res.ok) {
        agoraToken.current = data.token;
        return true;
      } else {
        alert(data.error || "Could not get Agora token");
        return false;
      }
    } catch (err) {
      console.error(err);
      alert("Error getting Agora token");
      return false;
    }
  };

  const joinCall = async () => {
    const ok = await getAgoraToken();
    if (!ok) return;

    await client.join(APP_ID, CHANNEL_NAME, agoraToken.current, null);

    localAudioTrack.current = await AgoraRTC.createMicrophoneAudioTrack();
    localVideoTrack.current = await AgoraRTC.createCameraVideoTrack();

    localVideoTrack.current.play(videoRef.current);
    await client.publish([localAudioTrack.current, localVideoTrack.current]);

    setJoined(true);
  };

  const leaveCall = async () => {
    await client.leave();

    localAudioTrack.current?.stop();
    localAudioTrack.current?.close();
    localVideoTrack.current?.stop();
    localVideoTrack.current?.close();

    if (localScreenTrack.current) {
      await stopScreenShare();
    }

    setJoined(false);
  };

  const startScreenShare = async () => {
    localScreenTrack.current = await AgoraRTC.createScreenVideoTrack();
    await client.publish(localScreenTrack.current);
    setScreenSharing(true);
  };

  const stopScreenShare = async () => {
    await client.unpublish(localScreenTrack.current);
    localScreenTrack.current?.stop();
    localScreenTrack.current?.close();
    setScreenSharing(false);
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Agora Call App (with Cognito Auth)</h2>

      {!idToken ? (
        <>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          /><br />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          /><br />
          <button onClick={handleLogin} style={{ marginTop: 10 }}>
            Login
          </button>
        </>
      ) : (
        <>
          {!joined ? (
            <button onClick={joinCall}>Join Call</button>
          ) : (
            <>
              <button onClick={leaveCall}>Leave Call</button>
              <button
                onClick={screenSharing ? stopScreenShare : startScreenShare}
                style={{ marginLeft: 10 }}
              >
                {screenSharing ? "Stop Share" : "Start Share"}
              </button>
            </>
          )}
          <div style={{ marginTop: 20 }}>
            <div
              ref={videoRef}
              style={{ width: 400, height: 300, backgroundColor: "#000" }}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default App;
